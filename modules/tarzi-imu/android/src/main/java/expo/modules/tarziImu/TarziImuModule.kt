package expo.modules.tarziImu

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One IMU sample stored in memory during recording.
 * offsetNs = nanoseconds since captureStartNs (recording-start monotonic time).
 */
private data class ImuSample(
    val offsetNs: Long,
    val x: Float,
    val y: Float,
    val z: Float
)

/**
 * Structured embed failure — carries stage label and diagnostic scalars so JS
 * can show a meaningful debug alert without receiving any raw file paths.
 */
private class ImuEmbedException(
    val stage: String,          // imu_file_check | timu_parse | gpmf_build | mp4_mux | output_validate
    val detail: String,         // safe message, no full paths
    val imuFileSizeBytes: Long = -1L,
    val sampleCount: Int = -1,
    val outputSizeBytes: Long = -1L,
    cause: Throwable? = null
) : Exception("[$stage] $detail", cause)

// ── Validation result types ──────────────────────────────────────────────────

/**
 * Result of the direct binary scan of the muxed output file.
 *
 * All booleans are set by scanning raw bytes; no MediaExtractor is involved.
 * False positives are extremely unlikely given the volume of GPMF data in a
 * real recording (8000+ samples produce many repeated FourCC occurrences).
 */
private data class GpmfDirectScan(
    val gpmdMarkerFound: Boolean,       // "gpmd" bytes present — GPMF track identifier
    val gpmfMarkerFound: Boolean,       // "GPMF" bytes present (supplemental check)
    val devcKeyFound: Boolean,          // DEVC container present — GPMF payload root
    val acclKeyFound: Boolean,          // ACCL FourCC found in payload
    val gyroKeyFound: Boolean,          // GYRO FourCC found in payload
    val scalKeyFound: Boolean,          // SCAL FourCC found in payload
    val stmpKeyFound: Boolean,          // STMP FourCC found — stream timestamp
    val tsmpMaxSamples: Int,            // largest TSMP value found (telemetry sample count)
    val totalGpmfPayloadBytes: Long,    // estimated GPMF payload bytes (from DEVC headers)
    val validationMethod: String = "direct_binary_scan_v1"
)

/**
 * Result of a best-effort MediaExtractor probe on the output file.
 *
 * All fields are populated even when MediaExtractor throws — failure info is
 * captured in failureClass/failureMessage instead of being re-thrown.
 */
private data class MediaExtractorProbe(
    val gpmdTrackFound: Boolean,
    val gpmdSampleCount: Int,
    val acclInPayload: Boolean,
    val gyroInPayload: Boolean,
    val failureClass: String,           // "" when no failure; safe class name otherwise
    val failureMessage: String,         // "" when no failure; trimmed message otherwise
    val failureSourceContext: String    // brief location hint (function + approximate context)
)

/**
 * TIMU binary format — persisted incrementally during recording so samples survive
 * a process kill. Both Android and iOS use big-endian throughout.
 *
 * Header (13 bytes):
 *   [4]  "TIMU"  — magic
 *   [1]  0x01    — format version (reject anything else)
 *   [8]  recording_start_ns (big-endian int64) — SystemClock.elapsedRealtimeNanos()
 *                 at the moment startCapture() was called
 *
 * Record (21 bytes, repeated):
 *   [1]  sensor type: 0x00 = accelerometer, 0x01 = gyroscope
 *   [8]  timestamp_offset_ns from recording_start_ns (big-endian int64)
 *   [4]  X float32 big-endian
 *   [4]  Y float32 big-endian
 *   [4]  Z float32 big-endian
 */
class TarziImuModule : Module() {

    // ── In-memory sample queues ─────────────────────────────────────────────
    private val accelSamples = CopyOnWriteArrayList<ImuSample>()
    private val gyroSamples  = CopyOnWriteArrayList<ImuSample>()

    @Volatile private var isCapturing = false
    private var captureStartNs = 0L

    // ── Session tracking ─────────────────────────────────────────────────────
    /** Short ID generated at startCapture — safe to expose to JS diagnostics. */
    private var captureSessionId = ""
    /** Normalized absolute path set by startCapture when disk streaming is active. */
    private var currentImuFilePath: String? = null
    /** True when an imuTempFilePath was provided and the file was opened successfully. */
    private var diskStreamingActive = false

    // ── Sensor setup ────────────────────────────────────────────────────────
    private var sensorManager: SensorManager? = null
    private var accelSensor: Sensor?          = null
    private var gyroSensor: Sensor?           = null

    // ── Disk streaming ──────────────────────────────────────────────────────
    private var diskStream: FileOutputStream? = null
    private val diskLock = Any()
    private var pendingDiskCount = 0

    companion object {
        private const val DISK_FLUSH_INTERVAL = 200
        private const val TIMU_MAGIC    = "TIMU"
        private const val TIMU_VERSION  = 0x01.toByte()
        private const val TYPE_ACCEL    = 0x00.toByte()
        private const val TYPE_GYRO     = 0x01.toByte()
        private const val CHUNK_NS      = 1_000_000_000L   // 1 second per GPMF chunk
        private const val RECORD_BYTES  = 21
        private const val HEADER_BYTES  = 13
    }

    // ── URI normalization ────────────────────────────────────────────────────

    /**
     * Convert any file URI or existing path to an Android File-compatible
     * absolute path.  Accepts:
     *   file:///data/user/0/…  →  /data/user/0/…   (standard Android file URI)
     *   file://data/user/0/…   →  /data/user/0/…   (malformed — guard)
     *   /data/user/0/…         →  /data/user/0/…   (already a path)
     */
    private fun uriToPath(uri: String): String {
        if (!uri.startsWith("file://")) return uri
        // android.net.Uri.parse handles file:// correctly including triple-slash form
        return Uri.parse(uri).path ?: uri.removePrefix("file://")
    }

    // ── Sensor listener ─────────────────────────────────────────────────────
    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            if (!isCapturing) return
            val offsetNs = event.timestamp - captureStartNs
            val sample = ImuSample(offsetNs, event.values[0], event.values[1], event.values[2])
            when (event.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> { accelSamples.add(sample); appendToDisk(TYPE_ACCEL, offsetNs, sample) }
                Sensor.TYPE_GYROSCOPE     -> { gyroSamples.add(sample);  appendToDisk(TYPE_GYRO,  offsetNs, sample) }
            }
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    // ── Disk helpers ────────────────────────────────────────────────────────

    private fun appendToDisk(type: Byte, offsetNs: Long, s: ImuSample) {
        synchronized(diskLock) {
            val stream = diskStream ?: return
            val rec = ByteBuffer.allocate(RECORD_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(type)
                .putLong(offsetNs)
                .putFloat(s.x)
                .putFloat(s.y)
                .putFloat(s.z)
                .array()
            try {
                stream.write(rec)
                pendingDiskCount++
                if (pendingDiskCount >= DISK_FLUSH_INTERVAL) {
                    stream.flush()
                    pendingDiskCount = 0
                }
            } catch (_: Exception) { /* non-fatal — sample stays in memory */ }
        }
    }

    private fun finalFlushDisk() {
        synchronized(diskLock) {
            try { diskStream?.flush() } catch (_: Exception) {}
            pendingDiskCount = 0
        }
    }

    private fun closeDisk() {
        synchronized(diskLock) {
            try { diskStream?.close() } catch (_: Exception) {}
            diskStream = null
            pendingDiskCount = 0
        }
    }

    /**
     * Open the TIMU disk file for streaming.
     *
     * @param normalizedPath  Already-converted absolute filesystem path (NOT a file:// URI).
     * @param captureStartNanoseconds  Recording start time for the TIMU header.
     * @throws Exception if the parent directory or file cannot be created/opened.
     */
    private fun openDiskFile(normalizedPath: String, captureStartNanoseconds: Long) {
        val f = File(normalizedPath)
        val parent = f.parentFile
        if (parent != null && !parent.exists()) {
            if (!parent.mkdirs()) {
                throw Exception("Cannot create IMU directory: ${parent.name}")
            }
        }
        val out = FileOutputStream(f, false) // truncate any previous content
        // Header: TIMU(4) + version(1) + captureStartNs(8) = 13 bytes
        val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
            .put(TIMU_MAGIC.toByteArray(Charsets.US_ASCII))
            .put(TIMU_VERSION)
            .putLong(captureStartNanoseconds)
            .array()
        out.write(header)
        diskStream = out
    }

    /** Read a TIMU file back into sample lists for re-muxing. */
    private fun readTimuFile(normalizedPath: String): Pair<List<ImuSample>, List<ImuSample>> {
        val file = File(normalizedPath)
        if (!file.exists() || file.length() < HEADER_BYTES.toLong()) {
            throw IllegalArgumentException("TIMU file missing or too small (${file.length()} B)")
        }
        val accel = ArrayList<ImuSample>()
        val gyro  = ArrayList<ImuSample>()

        RandomAccessFile(file, "r").use { raf ->
            val header = ByteArray(HEADER_BYTES)
            raf.readFully(header)
            val hBuf = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN)
            val magic = ByteArray(4).also { hBuf.get(it) }
            if (String(magic, Charsets.US_ASCII) != TIMU_MAGIC) {
                throw IllegalArgumentException("Invalid TIMU magic bytes")
            }
            val version = hBuf.get()
            if (version != TIMU_VERSION) {
                throw IllegalArgumentException("Unknown TIMU version: 0x${version.toInt().and(0xFF).toString(16)}")
            }
            @Suppress("UNUSED_VARIABLE") val startNs = hBuf.getLong()

            val rec  = ByteArray(RECORD_BYTES)
            val rBuf = ByteBuffer.wrap(rec).order(ByteOrder.BIG_ENDIAN)
            while (raf.read(rec) == RECORD_BYTES) {
                rBuf.rewind()
                val type     = rBuf.get()
                val offsetNs = rBuf.getLong()
                val x        = rBuf.getFloat()
                val y        = rBuf.getFloat()
                val z        = rBuf.getFloat()
                val sample   = ImuSample(offsetNs, x, y, z)
                when (type) {
                    TYPE_ACCEL -> accel.add(sample)
                    TYPE_GYRO  -> gyro.add(sample)
                }
            }
        }
        return Pair(accel, gyro)
    }

    // ── Module definition ────────────────────────────────────────────────────

    override fun definition() = ModuleDefinition {
        Name("TarziImu")

        Events("IMU_OUTPUT_VALIDATION_FAILED")

        AsyncFunction("checkSensorAvailability") { promise: Promise ->
            val ctx = appContext.reactContext
            val sm = ctx?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            promise.resolve(mapOf(
                "accelerometer" to (sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null),
                "gyroscope"     to (sm?.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null)
            ))
        }

        /**
         * Begin accelerometer + gyroscope capture at ~100 Hz.
         *
         * @param imuTempFilePath  file:// URI or absolute path for disk streaming.
         *                         Accepts file:///... form from React Native.
         *                         If disk open fails, the error is surfaced (not
         *                         swallowed) so JS can react appropriately.
         * @param taskId           Diagnostic identifier — not stored in sensor data.
         *
         * Resolves with { captureSessionId } on success.
         */
        AsyncFunction("startCapture") { imuTempFilePath: String?, taskId: String?, promise: Promise ->
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR_NO_CTX", "No React context", null)

            sensorManager = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            accelSensor   = sensorManager!!.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            gyroSensor    = sensorManager!!.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

            accelSamples.clear()
            gyroSamples.clear()
            closeDisk()

            captureSessionId   = UUID.randomUUID().toString().replace("-", "").take(8)
            currentImuFilePath = null
            diskStreamingActive = false
            captureStartNs = SystemClock.elapsedRealtimeNanos()

            if (!imuTempFilePath.isNullOrBlank()) {
                val normalizedPath = uriToPath(imuTempFilePath)
                try {
                    openDiskFile(normalizedPath, captureStartNs)
                    currentImuFilePath  = normalizedPath
                    diskStreamingActive = true
                } catch (e: Exception) {
                    // Surface the failure so the caller (JS/video.tsx) knows disk streaming failed.
                    return@AsyncFunction promise.reject(
                        "ERR_IMU_DISK",
                        "[startCapture] Cannot open IMU file: ${e.javaClass.simpleName}: ${e.message?.take(120) ?: "null"} (session=$captureSessionId)",
                        e
                    )
                }
            }

            isCapturing = true
            accelSensor?.let {
                sensorManager!!.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_GAME)
            }
            gyroSensor?.let {
                sensorManager!!.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_GAME)
            }

            promise.resolve(mapOf("captureSessionId" to captureSessionId))
        }

        /**
         * Stop capture, flush disk, validate the TIMU file, build time-aligned
         * GPMF chunks, mux into the video file in-place, validate output, and
         * return URI + metadata.
         *
         * Errors carry a structured message:  [stage] detail imu=NB samples=N session=ID
         * Stage labels: imu_file_check | timu_parse | mp4_mux | output_validate
         *
         * imuEmbedded is set to true only when GPMF validation passes.
         */
        AsyncFunction("stopAndEmbed") { videoUri: String, promise: Promise ->
            // Stop sensors immediately — do this before the background thread so no new
            // samples arrive while we snapshot/flush.
            isCapturing = false
            sensorManager?.unregisterListener(sensorListener)
            finalFlushDisk()
            closeDisk()

            val captureEndNs     = SystemClock.elapsedRealtimeNanos()
            val durationSec      = (captureEndNs - captureStartNs).toDouble() / 1_000_000_000.0
            val sessionId        = captureSessionId
            val imuFilePath      = currentImuFilePath   // normalized absolute path or null
            val wasDiskStreaming  = diskStreamingActive

            // Snapshot in-memory queues (backup if disk streaming wasn't used)
            val accelMem = ArrayList(accelSamples)
            val gyroMem  = ArrayList(gyroSamples)
            accelSamples.clear()
            gyroSamples.clear()

            Thread {
                runCatching {
                    val videoPath = uriToPath(videoUri)

                    // ── Stage: imu_file_check ────────────────────────────────
                    val imuFileSize: Long
                    val accelList: List<ImuSample>
                    val gyroList: List<ImuSample>

                    if (wasDiskStreaming && imuFilePath != null) {
                        val imuFile = File(imuFilePath)
                        imuFileSize = imuFile.length()

                        if (!imuFile.exists()) {
                            throw ImuEmbedException(
                                "imu_file_check",
                                "IMU file does not exist",
                                imuFileSizeBytes = 0L,
                                sampleCount = 0
                            )
                        }
                        if (imuFileSize < HEADER_BYTES.toLong()) {
                            throw ImuEmbedException(
                                "imu_file_check",
                                "IMU file too small to contain header (${imuFileSize} B)",
                                imuFileSizeBytes = imuFileSize,
                                sampleCount = 0
                            )
                        }

                        // ── Stage: timu_parse ────────────────────────────────
                        val (parsedAccel, parsedGyro) = try {
                            readTimuFile(imuFilePath)
                        } catch (e: Exception) {
                            throw ImuEmbedException(
                                "timu_parse",
                                "${e.javaClass.simpleName}: ${e.message?.take(120) ?: "null"}",
                                imuFileSizeBytes = imuFileSize,
                                sampleCount = 0,
                                cause = e
                            )
                        }
                        accelList = parsedAccel
                        gyroList  = parsedGyro
                    } else {
                        // No disk streaming — use in-memory samples
                        imuFileSize = -1L
                        accelList = accelMem
                        gyroList  = gyroMem
                    }

                    val totalSamples = accelList.size + gyroList.size

                    // ── Stage: mp4_mux / output_validate (inside muxGpmf) ────
                    val (finalUri, validationStatus) = muxGpmf(
                        sourcePath       = videoPath,
                        accelList        = accelList,
                        gyroList         = gyroList,
                        outputUri        = null,
                        imuFileSizeBytes = imuFileSize,
                        totalSamples     = totalSamples,
                        sessionId        = sessionId
                    )

                    val accelHz = if (durationSec > 0) accelList.size / durationSec else 0.0
                    val gyroHz  = if (durationSec > 0) gyroList.size  / durationSec else 0.0

                    promise.resolve(mapOf(
                        "uri"      to finalUri,
                        "metadata" to buildMetadataMap(
                            validationStatus, accelList.size, gyroList.size,
                            accelHz, gyroHz, sessionId
                        )
                    ))
                }.onFailure { e ->
                    promise.reject(
                        "ERR_EMBED",
                        buildErrorMessage(e, captureSessionId),
                        e as? Exception
                    )
                }
            }.start()
        }

        /**
         * Re-mux IMU data from a persisted TIMU file into a raw video file after
         * an app restart. Called by imuRecovery.ts when a PROCESSING_IMU draft is
         * found on launch.
         *
         * Accepts file:// URIs or absolute paths for all three arguments.
         * Returns the same map shape as stopAndEmbed.
         */
        AsyncFunction("resumeEmbed") { rawVideoUri: String, imuTempFilePath: String, outputUri: String, promise: Promise ->
            val sessionId = captureSessionId.ifBlank { "resume-${UUID.randomUUID().toString().take(6)}" }

            Thread {
                runCatching {
                    val imuPath   = uriToPath(imuTempFilePath)
                    val videoPath = uriToPath(rawVideoUri)

                    val imuFile     = File(imuPath)
                    val imuFileSize = imuFile.length()
                    if (!imuFile.exists() || imuFileSize < HEADER_BYTES.toLong()) {
                        throw ImuEmbedException(
                            "imu_file_check",
                            "TIMU file missing or too small (${imuFileSize} B)",
                            imuFileSizeBytes = imuFileSize,
                            sampleCount = 0
                        )
                    }

                    val (accelList, gyroList) = try {
                        readTimuFile(imuPath)
                    } catch (e: Exception) {
                        throw ImuEmbedException(
                            "timu_parse",
                            "${e.javaClass.simpleName}: ${e.message?.take(120) ?: "null"}",
                            imuFileSizeBytes = imuFileSize,
                            sampleCount = 0,
                            cause = e
                        )
                    }

                    if (accelList.isEmpty() && gyroList.isEmpty()) {
                        throw ImuEmbedException(
                            "timu_parse",
                            "TIMU file contains no samples",
                            imuFileSizeBytes = imuFileSize,
                            sampleCount = 0
                        )
                    }

                    val totalSamples = accelList.size + gyroList.size
                    val (finalUri, validationStatus) = muxGpmf(
                        sourcePath       = videoPath,
                        accelList        = accelList,
                        gyroList         = gyroList,
                        outputUri        = outputUri,
                        imuFileSizeBytes = imuFileSize,
                        totalSamples     = totalSamples,
                        sessionId        = sessionId
                    )

                    val allOffsets  = (accelList + gyroList).map { it.offsetNs }
                    val durationNs  = if (allOffsets.size > 1) allOffsets.max() - allOffsets.min() else 0L
                    val durationSec = durationNs.toDouble() / 1_000_000_000.0
                    val accelHz     = if (durationSec > 0) accelList.size / durationSec else 0.0
                    val gyroHz      = if (durationSec > 0) gyroList.size  / durationSec else 0.0

                    promise.resolve(mapOf(
                        "uri"      to finalUri,
                        "metadata" to buildMetadataMap(
                            validationStatus, accelList.size, gyroList.size,
                            accelHz, gyroHz, sessionId
                        )
                    ))
                }.onFailure { e ->
                    promise.reject(
                        if (e is ImuEmbedException && e.stage == "imu_file_check") "ERR_IMU_FILE" else "ERR_EMBED",
                        buildErrorMessage(e, sessionId),
                        e as? Exception
                    )
                }
            }.start()
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun buildMetadataMap(
        validationStatus: String,
        accelCount: Int,
        gyroCount: Int,
        accelHz: Double,
        gyroHz: Double,
        sessionId: String = ""
    ): Map<String, Any> = mapOf(
        "imuEmbedded"                 to (validationStatus == "ok"),
        "imuFormat"                   to "GPMF",
        "accelerometerSampleCount"    to accelCount,
        "gyroscopeSampleCount"        to gyroCount,
        "accelerometerEffectiveHz"    to accelHz,
        "gyroscopeEffectiveHz"        to gyroHz,
        "imuValidationStatus"         to validationStatus,
        "captureSessionId"            to sessionId
    )

    private fun buildErrorMessage(e: Throwable, sessionId: String): String {
        return when (e) {
            is ImuEmbedException -> buildString {
                append("[${e.stage}] ${e.detail}")
                if (e.imuFileSizeBytes >= 0L) append(" imu=${e.imuFileSizeBytes}B")
                if (e.sampleCount >= 0) append(" samples=${e.sampleCount}")
                if (e.outputSizeBytes >= 0L) append(" out=${e.outputSizeBytes}B")
                append(" session=$sessionId")
            }
            else -> "[unknown] ${e.javaClass.simpleName}: ${e.message?.take(120) ?: "null"} session=$sessionId"
        }
    }

    // ── MP4 muxing ───────────────────────────────────────────────────────────

    /**
     * Mux GPMF telemetry into an MP4 file.
     *
     * @param sourcePath      Absolute filesystem path to the source MP4 (NOT a URI).
     * @param accelList       Accelerometer samples with offsetNs relative to recording start.
     * @param gyroList        Gyroscope samples.
     * @param outputUri       When non-null, write result here (file:// URI or path).
     *                        When null, replace sourcePath in-place (stopAndEmbed path).
     * @param imuFileSizeBytes Passed through to structured error messages.
     * @param totalSamples    Passed through to structured error messages.
     * @param sessionId       Diagnostic session ID.
     *
     * @return (finalUri, validationStatus)
     * @throws ImuEmbedException on any failure with stage label and diagnostics.
     */
    private fun muxGpmf(
        sourcePath:       String,
        accelList:        List<ImuSample>,
        gyroList:         List<ImuSample>,
        outputUri:        String?,
        imuFileSizeBytes: Long = -1L,
        totalSamples:     Int  = -1,
        sessionId:        String = ""
    ): Pair<String, String> {
        // Resolve React context without !! — surface a real error if it's gone
        val ctx = appContext.reactContext
            ?: throw ImuEmbedException(
                "mp4_mux", "React context unavailable",
                imuFileSizeBytes, totalSamples
            )

        val sourceFile = File(sourcePath)
        if (!sourceFile.exists()) {
            throw ImuEmbedException(
                "mp4_mux", "Source video not found (${sourceFile.name})",
                imuFileSizeBytes, totalSamples
            )
        }
        val sourceSize = sourceFile.length()
        if (sourceSize == 0L) {
            throw ImuEmbedException(
                "mp4_mux", "Source video is empty",
                imuFileSizeBytes, totalSamples
            )
        }

        // Always write to a temp file first — prevents corrupting source on failure
        val tempFile = File(ctx.cacheDir, "tarzi_imu_${System.currentTimeMillis()}.mp4")

        try {
            val extractor = try {
                MediaExtractor().also { it.setDataSource(sourcePath) }
            } catch (e: Exception) {
                throw ImuEmbedException(
                    "mp4_mux",
                    "Cannot open source video: ${e.javaClass.simpleName}",
                    imuFileSizeBytes, totalSamples, cause = e
                )
            }

            val trackCount = extractor.trackCount

            val muxer = try {
                MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            } catch (e: Exception) {
                extractor.release()
                throw ImuEmbedException(
                    "mp4_mux",
                    "Cannot create muxer: ${e.javaClass.simpleName}",
                    imuFileSizeBytes, totalSamples, cause = e
                )
            }

            try {
                // Pass-through: copy every existing track
                val trackMap = mutableMapOf<Int, Int>()
                for (i in 0 until trackCount) {
                    trackMap[i] = muxer.addTrack(extractor.getTrackFormat(i))
                }

                // Add GoPro-style GPMD metadata track
                val gpmdFmt = MediaFormat()
                gpmdFmt.setString(MediaFormat.KEY_MIME, "application/gpmd")
                val gpmdIdx = muxer.addTrack(gpmdFmt)

                muxer.start()

                // Copy all source tracks sequentially
                val copyBuf = ByteBuffer.allocate(5 * 1024 * 1024)
                val info    = MediaCodec.BufferInfo()
                for (extIdx in 0 until trackCount) {
                    extractor.selectTrack(extIdx)
                    extractor.seekTo(0L, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
                    val muxIdx = trackMap[extIdx]!!
                    while (true) {
                        copyBuf.clear()
                        val sz = extractor.readSampleData(copyBuf, 0)
                        if (sz < 0) break
                        info.apply {
                            offset = 0; size = sz
                            presentationTimeUs = extractor.sampleTime
                            flags = extractor.sampleFlags
                        }
                        copyBuf.position(0)   // ensure position is at data start for muxer
                        muxer.writeSampleData(muxIdx, copyBuf, info)
                        extractor.advance()
                    }
                    extractor.unselectTrack(extIdx)
                }
                extractor.release()

                // Build GPMF chunks (one per second) and write each as a separate sample
                val chunks = buildGpmfChunks(accelList, gyroList)
                if (chunks.isEmpty()) {
                    val emptyPayload = buildGpmfPayload(emptyList(), emptyList())
                    val gpmfBuf = ByteBuffer.wrap(emptyPayload)
                    info.apply { offset = 0; size = emptyPayload.size; presentationTimeUs = 0L; flags = MediaCodec.BUFFER_FLAG_KEY_FRAME }
                    muxer.writeSampleData(gpmdIdx, gpmfBuf, info)
                } else {
                    for ((payload, presentationUs) in chunks) {
                        val gpmfBuf = ByteBuffer.wrap(payload)
                        info.apply {
                            offset = 0; size = payload.size
                            presentationTimeUs = presentationUs
                            flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
                        }
                        muxer.writeSampleData(gpmdIdx, gpmfBuf, info)
                    }
                }

                try {
                    muxer.stop()
                } catch (e: Exception) {
                    throw ImuEmbedException(
                        "mp4_mux",
                        "Muxer stop failed: ${e.javaClass.simpleName}: ${e.message?.take(80) ?: "null"}",
                        imuFileSizeBytes, totalSamples, cause = e
                    )
                }
            } finally {
                try { muxer.release() } catch (_: Exception) {}
            }

            // ── Stage: output_validate ───────────────────────────────────────
            //
            // The temp file is preserved here throughout validation so that both the
            // direct binary scan and the MediaExtractor probe can read it in full
            // before any deletion occurs.  Deletion only happens in the catch block
            // below AFTER the admin event has been emitted.
            val tempSize = tempFile.length()

            val (validationStatus, validationDiag) =
                validateGpmfOutput(tempFile, accelList.size, gyroList.size)

            if (validationStatus.startsWith("error_")) {
                // Build the safe admin event payload — no local file paths.
                val eventPayload: Map<String, Any> = buildMap {
                    putAll(validationDiag)
                    put("stage",            "output_validate")
                    put("imuFileSizeBytes", imuFileSizeBytes)
                    put("captureSessionId", sessionId)
                }
                try {
                    // Emit BEFORE throwing so the event is sent while tempFile
                    // still exists on disk (probe already finished, but keep the
                    // ordering clear for future diagnostics).
                    sendEvent("IMU_OUTPUT_VALIDATION_FAILED", eventPayload)
                } catch (_: Exception) {
                    // Non-fatal — event emission must never suppress the real error.
                }
                // temp file is deleted in the outer catch below
                throw ImuEmbedException(
                    "output_validate",
                    "GPMF validation: $validationStatus " +
                    "(devc=${validationDiag["devcKeyFound"]} " +
                    "accl=${validationDiag["acclKeyFound"]} " +
                    "gyro=${validationDiag["gyroKeyFound"]} " +
                    "scal=${validationDiag["scalKeyFound"]} " +
                    "stmp=${validationDiag["stmpKeyFound"]} " +
                    "tsmp=${validationDiag["tsmpMaxSamples"]})",
                    imuFileSizeBytes, totalSamples, tempSize
                )
            }

            // ── Place output ─────────────────────────────────────────────────
            val finalUri: String
            if (outputUri != null) {
                val outPath = uriToPath(outputUri)
                val outFile = File(outPath)
                outFile.parentFile?.mkdirs()
                if (!tempFile.renameTo(outFile)) {
                    tempFile.copyTo(outFile, overwrite = true)
                    tempFile.delete()
                }
                finalUri = outputUri
            } else {
                sourceFile.delete()
                if (!tempFile.renameTo(sourceFile)) {
                    tempFile.copyTo(sourceFile, overwrite = true)
                    tempFile.delete()
                }
                // Return the original URI so JS URIs remain valid
                finalUri = if (sourcePath.startsWith("/")) "file://$sourcePath" else sourcePath
            }

            return Pair(finalUri, validationStatus)

        } catch (e: ImuEmbedException) {
            tempFile.delete()
            throw e
        } catch (e: Exception) {
            tempFile.delete()
            throw ImuEmbedException(
                "mp4_mux",
                "${e.javaClass.simpleName}: ${e.message?.take(120) ?: "null"}",
                imuFileSizeBytes, totalSamples, cause = e
            )
        }
    }

    /**
     * Split accel/gyro samples into 1-second windows and build one GPMF payload
     * per window. Returns [(payload_bytes, presentation_us)] sorted by time.
     */
    private fun buildGpmfChunks(
        accelList: List<ImuSample>,
        gyroList:  List<ImuSample>
    ): List<Pair<ByteArray, Long>> {
        if (accelList.isEmpty() && gyroList.isEmpty()) return emptyList()

        val maxOffsetNs = maxOf(
            accelList.lastOrNull()?.offsetNs ?: Long.MIN_VALUE,
            gyroList.lastOrNull()?.offsetNs  ?: Long.MIN_VALUE
        )
        if (maxOffsetNs <= 0L) return emptyList()

        val numChunks = ((maxOffsetNs / CHUNK_NS) + 1).toInt().coerceAtLeast(1)
        val result    = ArrayList<Pair<ByteArray, Long>>(numChunks)

        for (i in 0 until numChunks) {
            val windowStart   = i.toLong() * CHUNK_NS
            val windowEnd     = windowStart + CHUNK_NS
            val presentUs     = i.toLong() * 1_000_000L   // microseconds, used as muxer timestamp + STMP
            val accelChunk    = accelList.filter { it.offsetNs in windowStart until windowEnd }
            val gyroChunk     = gyroList.filter  { it.offsetNs in windowStart until windowEnd }
            if (accelChunk.isEmpty() && gyroChunk.isEmpty()) continue
            result.add(Pair(buildGpmfPayload(accelChunk, gyroChunk, presentUs), presentUs))
        }
        return result
    }

    // ── GPMF validation ──────────────────────────────────────────────────────

    /**
     * Compare 4 bytes in [buf] starting at [i] against literal byte values.
     * Inlined for tight-loop use in [scanGpmfBinary].
     */
    private fun matchFourCC(buf: ByteArray, i: Int, a: Int, b: Int, c: Int, d: Int): Boolean =
        buf[i].toInt().and(0xFF) == a &&
        buf[i + 1].toInt().and(0xFF) == b &&
        buf[i + 2].toInt().and(0xFF) == c &&
        buf[i + 3].toInt().and(0xFF) == d

    /**
     * Scan the muxed output file directly for GPMF binary markers.
     *
     * Strategy: read the file in 64 KB chunks, carry the last 3 bytes of each
     * chunk into the next to avoid missing FourCCs that span a chunk boundary.
     * No MediaExtractor — works regardless of whether Android recognises the
     * application/gpmd track type on the current device.
     *
     * Required keys checked per spec and user requirement:
     *   gpmd — track type marker in MP4 stsd box (= "GPMF track present")
     *   GPMF — supplemental GPMF namespace marker
     *   DEVC — GPMF device container (root of every payload we write)
     *   ACCL — accelerometer stream FourCC
     *   GYRO — gyroscope stream FourCC
     *   SCAL — scale factor FourCC
     *   STMP — per-stream microsecond timestamp FourCC (added in this fix)
     *   TSMP — total-sample-count FourCC; value extracted for sample count check
     */
    private fun scanGpmfBinary(file: File): GpmfDirectScan {
        val CHUNK  = 65536
        val CARRY  = 3     // need to carry 3 bytes to not miss any 4-byte key at boundary

        var gpmdFound  = false
        var gpmfFound  = false
        var devcFound  = false
        var acclFound  = false
        var gyroFound  = false
        var scalFound  = false
        var stmpFound  = false
        var tsmpMax    = 0
        var totalPayload = 0L

        val carry = ByteArray(CARRY)
        val chunk  = ByteArray(CHUNK)
        var carryLen = 0

        RandomAccessFile(file, "r").use { raf ->
            while (true) {
                val n = raf.read(chunk)
                if (n <= 0) break

                // Working slice = carry[0..carryLen) + chunk[0..n)
                val total  = carryLen + n
                val buf    = ByteArray(total)
                System.arraycopy(carry, 0, buf, 0, carryLen)
                System.arraycopy(chunk, 0, buf, carryLen, n)

                val limit = total - 3   // need buf[i..i+3] to be valid
                for (i in 0 until limit) {
                    when {
                        matchFourCC(buf, i, 0x67, 0x70, 0x6D, 0x64) -> gpmdFound = true // "gpmd"
                        matchFourCC(buf, i, 0x47, 0x50, 0x4D, 0x46) -> gpmfFound = true // "GPMF"
                        matchFourCC(buf, i, 0x44, 0x45, 0x56, 0x43) -> {                // "DEVC"
                            devcFound = true
                            // DEVC hdr layout: [DEVC(4)][type(1)][size(1)][repeat(2)]
                            // inner content = size * repeat bytes
                            if (i + 7 < total) {
                                val sz  = buf[i + 5].toInt().and(0xFF)
                                val rep = (buf[i + 6].toInt().and(0xFF) shl 8) or
                                          buf[i + 7].toInt().and(0xFF)
                                totalPayload += (sz.toLong() * rep.toLong())
                            }
                        }
                        matchFourCC(buf, i, 0x41, 0x43, 0x43, 0x4C) -> acclFound = true // "ACCL"
                        matchFourCC(buf, i, 0x47, 0x59, 0x52, 0x4F) -> gyroFound = true // "GYRO"
                        matchFourCC(buf, i, 0x53, 0x43, 0x41, 0x4C) -> scalFound = true // "SCAL"
                        matchFourCC(buf, i, 0x53, 0x54, 0x4D, 0x50) -> stmpFound = true // "STMP"
                        matchFourCC(buf, i, 0x54, 0x53, 0x4D, 0x50) -> {                // "TSMP"
                            // TSMP hdr: [TSMP(4)][0x4C(1)][0x04(1)][0x00,0x01(2)] then uint32 value
                            // Total offset to value = 8 bytes after FourCC start
                            if (i + 11 < total) {
                                val count = ByteBuffer.wrap(buf, i + 8, 4)
                                    .order(ByteOrder.BIG_ENDIAN).int
                                if (count > 0 && count > tsmpMax) tsmpMax = count
                            }
                        }
                    }
                }

                // Carry last CARRY bytes into the next iteration
                carryLen = minOf(CARRY, n)
                System.arraycopy(chunk, n - carryLen, carry, 0, carryLen)

                if (n < CHUNK) break  // EOF
            }
        }

        return GpmfDirectScan(
            gpmdMarkerFound      = gpmdFound,
            gpmfMarkerFound      = gpmfFound,
            devcKeyFound         = devcFound,
            acclKeyFound         = acclFound,
            gyroKeyFound         = gyroFound,
            scalKeyFound         = scalFound,
            stmpKeyFound         = stmpFound,
            tsmpMaxSamples       = tsmpMax,
            totalGpmfPayloadBytes = totalPayload
        )
    }

    /**
     * Run a best-effort MediaExtractor probe on the muxed output file.
     *
     * NEVER throws — any exception (including [IllegalArgumentException] with a
     * null message thrown by OEM extractors when they encounter the
     * application/gpmd track type) is captured into [MediaExtractorProbe.failureClass]
     * and [MediaExtractorProbe.failureMessage].
     *
     * Root cause of the original `[output_validate] Validation threw:
     * IllegalArgumentException: null` crash: MediaExtractor.getTrackFormat(i)
     * throws IllegalArgumentException() (no message) for the application/gpmd
     * track on devices whose OEM extractor doesn't recognise the custom MIME type.
     * This probe is now supplemental only — its failure does not reject a file
     * that passes the direct binary scan.
     */
    private fun probeWithMediaExtractor(path: String): MediaExtractorProbe {
        val v = MediaExtractor()
        var gpmdTrackFound  = false
        var gpmdSampleCount = 0
        var acclFound       = false
        var gyroFound       = false
        var failureClass    = ""
        var failureMsg      = ""
        var failureCtx      = ""

        try {
            v.setDataSource(path)

            var gpmdIdx = -1
            for (i in 0 until v.trackCount) {
                val fmt = try {
                    v.getTrackFormat(i)
                    // ↑ Known throw site: getTrackFormat() throws IllegalArgumentException
                    //   with null message on OEM devices for application/gpmd tracks.
                } catch (e: Exception) {
                    failureClass = e.javaClass.simpleName
                    failureMsg   = e.message?.take(120) ?: "null"
                    failureCtx   = "probeWithMediaExtractor/getTrackFormat(track=$i)"
                    continue   // skip unreadable track, keep checking others
                }
                val mime = try { fmt.getString(MediaFormat.KEY_MIME) ?: "" }
                           catch (_: Exception) { "" }
                if (mime.contains("gpmd", ignoreCase = true) ||
                    mime.contains("application/gpmd", ignoreCase = true)) {
                    gpmdIdx        = i
                    gpmdTrackFound = true
                }
            }

            if (gpmdIdx >= 0) {
                try {
                    v.selectTrack(gpmdIdx)
                    val scanBuf = ByteBuffer.allocate(2048)
                    while (true) {
                        scanBuf.clear()
                        val sz = v.readSampleData(scanBuf, 0)
                        if (sz < 0) break
                        gpmdSampleCount++
                        val bytes = ByteArray(minOf(sz, 2048))
                        scanBuf.rewind()
                        scanBuf.get(bytes, 0, bytes.size)
                        val s = String(bytes, Charsets.US_ASCII)
                        if (s.contains("ACCL")) acclFound = true
                        if (s.contains("GYRO")) gyroFound = true
                        v.advance()
                    }
                } catch (e: Exception) {
                    if (failureClass.isEmpty()) {
                        failureClass = e.javaClass.simpleName
                        failureMsg   = e.message?.take(120) ?: "null"
                        failureCtx   = "probeWithMediaExtractor/readSampleData"
                    }
                }
            }
        } catch (e: Exception) {
            failureClass = e.javaClass.simpleName
            failureMsg   = e.message?.take(120) ?: "null"
            failureCtx   = "probeWithMediaExtractor/setDataSource"
        } finally {
            try { v.release() } catch (_: Exception) {}
        }

        return MediaExtractorProbe(
            gpmdTrackFound    = gpmdTrackFound,
            gpmdSampleCount   = gpmdSampleCount,
            acclInPayload     = acclFound,
            gyroInPayload     = gyroFound,
            failureClass      = failureClass,
            failureMessage    = failureMsg,
            failureSourceContext = failureCtx
        )
    }

    /**
     * Validate the muxed output file and return a (validationStatus, diagnosticsMap) pair.
     *
     * Primary path: direct binary scan ([scanGpmfBinary]) — never throws, works on all devices.
     * Supplemental: safe MediaExtractor probe ([probeWithMediaExtractor]) — result is
     *   recorded in diagnostics but does NOT override a passing direct-scan result.
     *
     * Validation rules (direct scan required for "ok"):
     *   - devcKeyFound         → GPMF payload root present
     *   - acclKeyFound         → accelerometer data present
     *   - gyroKeyFound         → gyroscope data present
     *   - scalKeyFound         → scale factor present
     *   - stmpKeyFound         → per-stream timestamp present (STMP, added in this fix)
     *   - tsmpMaxSamples > 0   → non-zero telemetry sample count
     *
     * The diagnosticsMap is safe to include in admin events (no local file paths).
     *
     * @return (status, diagnosticsMap)
     *   status: "ok" | "warning_partial_sensor_data" | "warning_no_sensor_data" |
     *           "error_no_devc" | "error_no_accl" | "error_no_gyro" |
     *           "error_no_scal" | "error_no_stmp" | "error_zero_tsmp"
     */
    private fun validateGpmfOutput(
        file:       File,
        accelCount: Int,
        gyroCount:  Int
    ): Pair<String, Map<String, Any>> {
        if (accelCount == 0 && gyroCount == 0) {
            val emptyDiag: Map<String, Any> = mapOf(
                "validationMethod"   to "skipped_no_sensor_data",
                "outputSizeBytes"    to file.length(),
                "accelCount"         to 0,
                "gyroCount"          to 0
            )
            return Pair("warning_no_sensor_data", emptyDiag)
        }

        val scan  = try { scanGpmfBinary(file) }
                    catch (e: Exception) {
                        // scanGpmfBinary is designed not to throw, but be defensive
                        val safeDiag: Map<String, Any> = mapOf(
                            "validationMethod"    to "direct_scan_threw",
                            "scanFailureClass"    to e.javaClass.simpleName,
                            "scanFailureMessage"  to (e.message?.take(120) ?: "null"),
                            "outputSizeBytes"     to file.length()
                        )
                        return Pair("error_scan_threw", safeDiag)
                    }

        val probe = probeWithMediaExtractor(file.absolutePath)

        val status = when {
            accelCount == 0 || gyroCount == 0 -> "warning_partial_sensor_data"
            !scan.devcKeyFound                -> "error_no_devc"
            !scan.acclKeyFound                -> "error_no_accl"
            !scan.gyroKeyFound                -> "error_no_gyro"
            !scan.scalKeyFound                -> "error_no_scal"
            !scan.stmpKeyFound                -> "error_no_stmp"
            scan.tsmpMaxSamples == 0          -> "error_zero_tsmp"
            else                              -> "ok"
        }

        val diag: Map<String, Any> = mapOf(
            // ── Direct scan results ──────────────────────────────────────
            "validationMethod"            to scan.validationMethod,
            "outputSizeBytes"             to file.length(),
            "gpmdMarkerFound"             to scan.gpmdMarkerFound,
            "gpmfMarkerFound"             to scan.gpmfMarkerFound,
            "devcKeyFound"                to scan.devcKeyFound,
            "acclKeyFound"                to scan.acclKeyFound,
            "gyroKeyFound"                to scan.gyroKeyFound,
            "scalKeyFound"                to scan.scalKeyFound,
            "stmpKeyFound"                to scan.stmpKeyFound,
            "tsmpMaxSamples"              to scan.tsmpMaxSamples,
            "totalGpmfPayloadBytes"       to scan.totalGpmfPayloadBytes,
            // ── MediaExtractor probe (supplemental) ──────────────────────
            "extractorGpmdTrackFound"     to probe.gpmdTrackFound,
            "extractorGpmdSampleCount"    to probe.gpmdSampleCount,
            "extractorAcclInPayload"      to probe.acclInPayload,
            "extractorGyroInPayload"      to probe.gyroInPayload,
            "extractorFailureClass"       to probe.failureClass,
            "extractorFailureMessage"     to probe.failureMessage,
            "extractorFailureContext"     to probe.failureSourceContext,
            // ── Input telemetry counts ───────────────────────────────────
            "telemetrySampleCount"        to (accelCount + gyroCount),
            "accelCount"                  to accelCount,
            "gyroCount"                   to gyroCount,
            // ── Final verdict ────────────────────────────────────────────
            "validationStatus"            to status
        )

        return Pair(status, diag)
    }

    // ── GPMF binary builder ───────────────────────────────────────────────────

    private fun pad4(data: ByteArray): ByteArray {
        val rem = data.size % 4
        return if (rem == 0) data else data + ByteArray(4 - rem)
    }

    private fun hdr(fourCC: String, type: Byte, size: Byte, repeat: Short): ByteArray =
        ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN)
            .put(fourCC.toByteArray(Charsets.US_ASCII))
            .put(type).put(size).putShort(repeat)
            .array()

    private fun gpmfContainer(fourCC: String, inner: ByteArray): ByteArray {
        val padded = pad4(inner)
        return hdr(fourCC, 0x00, 4, (padded.size / 4).toShort()) + padded
    }

    private fun gpmfString(fourCC: String, value: String): ByteArray {
        val data = value.toByteArray(Charsets.US_ASCII)
        return hdr(fourCC, 0x63, 1, data.size.toShort()) + pad4(data)
    }

    private fun gpmfInt16(fourCC: String, value: Short): ByteArray {
        val data = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN)
            .putShort(value).putShort(0).array()
        return hdr(fourCC, 0x73.toByte(), 2, 1) + data
    }

    private fun gpmfUint32(fourCC: String, value: Int): ByteArray {
        val data = ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN)
            .putInt(value).array()
        return hdr(fourCC, 0x4C.toByte(), 4, 1) + data
    }

    /**
     * GPMF uint64 field (type 'J', 0x4A).
     * Used for STMP (stream timestamp in microseconds).
     */
    private fun gpmfUint64(fourCC: String, value: Long): ByteArray {
        val data = ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN)
            .putLong(value).array()
        return hdr(fourCC, 0x4A, 8, 1) + data
    }

    private fun gpmfFloat3d(fourCC: String, samples: List<ImuSample>): ByteArray {
        if (samples.isEmpty()) return hdr(fourCC, 0x66.toByte(), 12, 0)
        val data = ByteBuffer.allocate(12 * samples.size).order(ByteOrder.BIG_ENDIAN).apply {
            for (s in samples) { putFloat(s.x); putFloat(s.y); putFloat(s.z) }
        }.array()
        return hdr(fourCC, 0x66.toByte(), 12, samples.size.toShort()) + data
    }

    /**
     * Build an accelerometer STRM block.
     *
     * @param startTimeUs  Presentation time of the first sample in this chunk, in
     *                     microseconds. Written as STMP (uint64, type J) so downstream
     *                     GPMF parsers can correctly time-align the telemetry track.
     */
    private fun buildAccelStream(samples: List<ImuSample>, startTimeUs: Long = 0L): ByteArray =
        gpmfContainer("STRM",
            gpmfString("STNM", "Accelerometer") +
            gpmfString("SIUN", "m/s2") +
            gpmfUint32("TSMP", samples.size) +
            gpmfUint64("STMP", startTimeUs) +
            gpmfInt16("SCAL", 1) +
            gpmfFloat3d("ACCL", samples))

    /**
     * Build a gyroscope STRM block.
     *
     * @param startTimeUs  See [buildAccelStream].
     */
    private fun buildGyroStream(samples: List<ImuSample>, startTimeUs: Long = 0L): ByteArray =
        gpmfContainer("STRM",
            gpmfString("STNM", "Gyroscope") +
            gpmfString("SIUN", "rad/s") +
            gpmfUint32("TSMP", samples.size) +
            gpmfUint64("STMP", startTimeUs) +
            gpmfInt16("SCAL", 1) +
            gpmfFloat3d("GYRO", samples))

    /**
     * @param startTimeUs  Chunk presentation time in microseconds, forwarded to
     *                     each stream builder so STMP timestamps are per-chunk.
     */
    private fun buildGpmfPayload(
        accelList: List<ImuSample>,
        gyroList: List<ImuSample>,
        startTimeUs: Long = 0L
    ): ByteArray =
        gpmfContainer("DEVC",
            gpmfString("DVNM", "Tarzi Mobile") +
            buildAccelStream(accelList, startTimeUs) +
            buildGyroStream(gyroList, startTimeUs))
}
