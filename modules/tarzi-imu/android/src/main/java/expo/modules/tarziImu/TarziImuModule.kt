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
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
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
 *
 * Limits (cannot be worked around at the OS level):
 *  - SIGKILL may truncate the last partial write. The flush interval (200 samples,
 *    ~2 s at 100 Hz) bounds the data loss window.
 *  - Samples captured between the last flush and a force-kill are lost.
 *  - The TIMU file is NOT deleted by this module; the caller (imuRecovery.ts)
 *    deletes it only after the final MP4 passes GPMF validation.
 *  - Drafts cannot survive app uninstall or cleared app storage.
 */
class TarziImuModule : Module() {

    // ── In-memory sample queues ─────────────────────────────────────────────
    private val accelSamples = CopyOnWriteArrayList<ImuSample>()
    private val gyroSamples  = CopyOnWriteArrayList<ImuSample>()

    @Volatile private var isCapturing = false
    private var captureStartNs = 0L

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
            // 21 bytes: type(1) + offsetNs(8) + x(4) + y(4) + z(4)
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
            } catch (_: Exception) { /* non-fatal — samples still in memory */ }
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

    private fun openDiskFile(filePath: String, captureStartNanoseconds: Long) {
        try {
            val f = File(filePath)
            f.parentFile?.mkdirs()
            val out = FileOutputStream(f, false) // truncate any previous content
            // Header: TIMU(4) + version(1) + captureStartNs(8) = 13 bytes
            val header = ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
                .put(TIMU_MAGIC.toByteArray(Charsets.US_ASCII))
                .put(TIMU_VERSION)
                .putLong(captureStartNanoseconds)
                .array()
            out.write(header)
            diskStream = out
        } catch (_: Exception) {
            diskStream = null // disk streaming unavailable — samples stay in memory only
        }
    }

    /** Read a TIMU file back into sample lists for re-muxing. */
    private fun readTimuFile(filePath: String): Pair<List<ImuSample>, List<ImuSample>> {
        val file = File(filePath)
        if (!file.exists() || file.length() < HEADER_BYTES.toLong()) {
            throw IllegalArgumentException("TIMU file missing or too small: $filePath")
        }
        val accel = ArrayList<ImuSample>()
        val gyro  = ArrayList<ImuSample>()

        RandomAccessFile(file, "r").use { raf ->
            // Validate header
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
            // captureStartNs from header (not needed for offset-based samples but validates file)
            @Suppress("UNUSED_VARIABLE") val captureStartNs = hBuf.getLong()

            // Read records
            val rec = ByteArray(RECORD_BYTES)
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
                    // unknown type — skip silently
                }
            }
        }
        return Pair(accel, gyro)
    }

    // ── Module definition ────────────────────────────────────────────────────

    override fun definition() = ModuleDefinition {
        Name("TarziImu")

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
         * @param imuTempFilePath  Optional path for incremental disk streaming.
         *                         When provided, samples are flushed every
         *                         DISK_FLUSH_INTERVAL writes so they survive a
         *                         process kill. The caller must ensure the parent
         *                         directory exists (or use ensureImuDir()).
         * @param taskId           Diagnostic identifier only — not stored in data.
         *
         * Requires an EAS development or production build. No-op in Expo Go.
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

            captureStartNs = SystemClock.elapsedRealtimeNanos()

            if (!imuTempFilePath.isNullOrBlank()) {
                openDiskFile(imuTempFilePath, captureStartNs)
            }

            isCapturing = true
            accelSensor?.let {
                sensorManager!!.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_GAME)
            }
            gyroSensor?.let {
                sensorManager!!.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_GAME)
            }

            promise.resolve(null)
        }

        /**
         * Stop capture, flush disk, build time-aligned GPMF chunks, mux into the
         * video file in-place, validate, and return URI + metadata.
         *
         * imuEmbedded is set to true only when GPMF validation passes.
         */
        AsyncFunction("stopAndEmbed") { videoUri: String, promise: Promise ->
            isCapturing = false
            sensorManager?.unregisterListener(sensorListener)
            finalFlushDisk()
            closeDisk()

            val captureEndNs   = SystemClock.elapsedRealtimeNanos()
            val durationSec    = (captureEndNs - captureStartNs).toDouble() / 1_000_000_000.0

            val accelList = ArrayList(accelSamples)
            val gyroList  = ArrayList(gyroSamples)
            accelSamples.clear()
            gyroSamples.clear()

            Thread {
                runCatching {
                    val (_, validationStatus) = muxGpmf(videoUri, accelList, gyroList, outputUri = null)
                    val accelHz = if (durationSec > 0) accelList.size / durationSec else 0.0
                    val gyroHz  = if (durationSec > 0) gyroList.size / durationSec else 0.0
                    promise.resolve(mapOf(
                        "uri"      to videoUri,
                        "metadata" to buildMetadataMap(validationStatus, accelList.size, gyroList.size, accelHz, gyroHz)
                    ))
                }.onFailure { e ->
                    promise.reject("ERR_EMBED", e.message ?: "embed failed", e as? Exception)
                }
            }.start()
        }

        /**
         * Re-mux IMU data from a persisted TIMU file into a raw video file after
         * an app restart. Called by imuRecovery.ts when a PROCESSING_IMU draft is
         * found on launch.
         *
         * Writes the result to outputUri WITHOUT modifying rawVideoUri or
         * imuTempFilePath — the caller is responsible for deleting those files
         * only after this function returns imuEmbedded=true.
         *
         * Returns the same map shape as stopAndEmbed.
         *
         * Fails with ERR_IMU_FILE when the TIMU file is missing, corrupt, or empty.
         * Fails with ERR_EMBED when the muxing step throws.
         */
        AsyncFunction("resumeEmbed") { rawVideoUri: String, imuTempFilePath: String, outputUri: String, promise: Promise ->
            Thread {
                runCatching {
                    val (accelList, gyroList) = readTimuFile(imuTempFilePath)
                    if (accelList.isEmpty() && gyroList.isEmpty()) {
                        promise.reject("ERR_IMU_FILE", "TIMU file contains no samples", null)
                        return@Thread
                    }

                    val (finalUri, validationStatus) = muxGpmf(rawVideoUri, accelList, gyroList, outputUri)

                    val allOffsets = (accelList + gyroList).map { it.offsetNs }
                    val durationNs  = if (allOffsets.size > 1) allOffsets.max()!! - allOffsets.min()!! else 0L
                    val durationSec = durationNs.toDouble() / 1_000_000_000.0
                    val accelHz     = if (durationSec > 0) accelList.size / durationSec else 0.0
                    val gyroHz      = if (durationSec > 0) gyroList.size / durationSec else 0.0

                    promise.resolve(mapOf(
                        "uri"      to finalUri,
                        "metadata" to buildMetadataMap(validationStatus, accelList.size, gyroList.size, accelHz, gyroHz)
                    ))
                }.onFailure { e ->
                    if (e is IllegalArgumentException) {
                        promise.reject("ERR_IMU_FILE", e.message ?: "Bad TIMU file", e)
                    } else {
                        promise.reject("ERR_EMBED", e.message ?: "resume embed failed", e as? Exception)
                    }
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
        gyroHz: Double
    ): Map<String, Any> = mapOf(
        "imuEmbedded"                 to (validationStatus == "ok"),
        "imuFormat"                   to "GPMF",
        "accelerometerSampleCount"    to accelCount,
        "gyroscopeSampleCount"        to gyroCount,
        "accelerometerEffectiveHz"    to accelHz,
        "gyroscopeEffectiveHz"        to gyroHz,
        "imuValidationStatus"         to validationStatus
    )

    // ── MP4 muxing ───────────────────────────────────────────────────────────

    /**
     * Mux GPMF telemetry into an MP4 file.
     *
     * Telemetry is split into 1-second chunks and written as separate muxer
     * samples with accurate presentation timestamps, making the gpmd track
     * compatible with GoPro-style GPMF parsers that require temporal alignment.
     *
     * @param sourceUri  File URI (file:// or plain path) of the source MP4.
     * @param accelList  Accelerometer samples with offsetNs relative to recording start.
     * @param gyroList   Gyroscope samples with offsetNs relative to recording start.
     * @param outputUri  When non-null, write result here and do NOT touch sourceUri.
     *                   When null, replace sourceUri in-place (stopAndEmbed path).
     *
     * @return (finalUri, validationStatus)
     */
    private fun muxGpmf(
        sourceUri: String,
        accelList: List<ImuSample>,
        gyroList:  List<ImuSample>,
        outputUri: String?
    ): Pair<String, String> {
        val ctx        = appContext.reactContext!!
        val sourcePath = sourceUri.removePrefix("file://")
        val sourceFile = File(sourcePath)

        // Always write to a temp file first — prevents corrupting source on failure
        val tempFile = File(ctx.cacheDir, "tarzi_imu_${System.currentTimeMillis()}.mp4")

        try {
            val extractor  = MediaExtractor()
            extractor.setDataSource(sourcePath)
            val trackCount = extractor.trackCount

            val muxer = MediaMuxer(tempFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

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

            // Copy all source tracks
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
                    muxer.writeSampleData(muxIdx, copyBuf, info)
                    extractor.advance()
                }
                extractor.unselectTrack(extIdx)
            }
            extractor.release()

            // Build GPMF chunks (one per second) and write each as a separate sample
            val chunks = buildGpmfChunks(accelList, gyroList)
            if (chunks.isEmpty()) {
                // No samples — write one minimal packet at t=0 so the track exists
                val emptyPayload = buildGpmfPayload(emptyList(), emptyList())
                val gpmfBuf      = ByteBuffer.wrap(emptyPayload)
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

            muxer.stop()
            muxer.release()

            // Validate before replacing any file
            val validationStatus = validateGpmfFile(
                tempFile.absolutePath, accelList.size, gyroList.size, chunks.size
            )

            // Place output
            val finalUri: String
            if (outputUri != null) {
                // resumeEmbed path: write to outputUri, don't touch source
                val outPath = outputUri.removePrefix("file://")
                val outFile = File(outPath)
                outFile.parentFile?.mkdirs()
                if (!tempFile.renameTo(outFile)) {
                    tempFile.copyTo(outFile, overwrite = true)
                    tempFile.delete()
                }
                finalUri = outputUri
            } else {
                // stopAndEmbed path: replace source in-place
                sourceFile.delete()
                if (!tempFile.renameTo(sourceFile)) {
                    tempFile.copyTo(sourceFile, overwrite = true)
                    tempFile.delete()
                }
                finalUri = sourceUri
            }

            return Pair(finalUri, validationStatus)
        } catch (e: Exception) {
            tempFile.delete()
            throw e
        }
    }

    /**
     * Split accel/gyro samples into 1-second windows and build one GPMF payload
     * per window. Returns [(payload_bytes, presentation_us)] sorted by time.
     *
     * Using multiple samples with accurate presentation timestamps makes the gpmd
     * track readable by GoPro-compatible parsers that verify temporal alignment
     * and reject a single untimed block at t = 0.
     */
    private fun buildGpmfChunks(
        accelList: List<ImuSample>,
        gyroList:  List<ImuSample>
    ): List<Pair<ByteArray, Long>> {
        if (accelList.isEmpty() && gyroList.isEmpty()) return emptyList()

        // Determine the full offset range
        val maxOffsetNs = maxOf(
            accelList.lastOrNull()?.offsetNs ?: Long.MIN_VALUE,
            gyroList.lastOrNull()?.offsetNs  ?: Long.MIN_VALUE
        )
        if (maxOffsetNs <= 0L) return emptyList()

        val numChunks = ((maxOffsetNs / CHUNK_NS) + 1).toInt().coerceAtLeast(1)
        val result    = ArrayList<Pair<ByteArray, Long>>(numChunks)

        for (i in 0 until numChunks) {
            val windowStart = i.toLong() * CHUNK_NS
            val windowEnd   = windowStart + CHUNK_NS

            val accelChunk = accelList.filter { it.offsetNs in windowStart until windowEnd }
            val gyroChunk  = gyroList.filter  { it.offsetNs in windowStart until windowEnd }
            if (accelChunk.isEmpty() && gyroChunk.isEmpty()) continue

            val payload        = buildGpmfPayload(accelChunk, gyroChunk)
            val presentationUs = i.toLong() * 1_000_000L   // chunk i starts at i seconds
            result.add(Pair(payload, presentationUs))
        }
        return result
    }

    // ── GPMF validation ──────────────────────────────────────────────────────

    /**
     * Validates the muxed MP4 for GPMF correctness:
     *   1. gpmd track exists
     *   2. More than one timed telemetry sample present
     *   3. ACCL and GYRO FourCCs readable in sample payload
     *   4. Telemetry covers ≥ 95 % of video duration
     */
    private fun validateGpmfFile(
        path:       String,
        accelCount: Int,
        gyroCount:  Int,
        chunkCount: Int
    ): String {
        if (accelCount == 0 && gyroCount == 0) return "warning_no_sensor_data"
        if (accelCount == 0 || gyroCount == 0)  return "warning_partial_sensor_data"

        val v = MediaExtractor()
        return try {
            v.setDataSource(path)

            var gpmdTrackIdx      = -1
            var videoDurationUs   = 0L

            for (i in 0 until v.trackCount) {
                val fmt  = v.getTrackFormat(i)
                val mime = fmt.getString(MediaFormat.KEY_MIME) ?: ""
                if (mime.contains("gpmd", ignoreCase = true)) {
                    gpmdTrackIdx = i
                }
                if (mime.startsWith("video/") && fmt.containsKey(MediaFormat.KEY_DURATION)) {
                    videoDurationUs = maxOf(videoDurationUs, fmt.getLong(MediaFormat.KEY_DURATION))
                }
            }
            if (gpmdTrackIdx < 0) return "error_no_gpmd_track"

            v.selectTrack(gpmdTrackIdx)

            val scanBuf          = ByteBuffer.allocate(2048)
            var sampleCount      = 0
            var firstTimeUs      = Long.MAX_VALUE
            var lastTimeUs       = Long.MIN_VALUE
            var hasAccl          = false
            var hasGyro          = false

            while (true) {
                scanBuf.clear()
                val sz = v.readSampleData(scanBuf, 0)
                if (sz < 0) break
                sampleCount++
                val ts = v.sampleTime
                if (ts < firstTimeUs) firstTimeUs = ts
                if (ts > lastTimeUs)  lastTimeUs  = ts

                // Scan first 2 KB of each sample for GPMF FourCCs
                val bytes = ByteArray(minOf(sz, 2048))
                scanBuf.rewind()
                scanBuf.get(bytes, 0, bytes.size)
                val s = String(bytes, Charsets.US_ASCII)
                if (s.contains("ACCL")) hasAccl = true
                if (s.contains("GYRO")) hasGyro = true

                v.advance()
            }

            if (sampleCount == 0)  return "error_empty_gpmd_track"
            if (sampleCount < 2)   return "warning_single_gpmd_sample"
            if (!hasAccl)          return "error_no_accl_stream"
            if (!hasGyro)          return "error_no_gyro_stream"

            // Coverage check: telemetry must span ≥ 95 % of video duration
            if (videoDurationUs > 0 && firstTimeUs != Long.MAX_VALUE) {
                val gpmdSpanUs = lastTimeUs - firstTimeUs
                val coverage   = gpmdSpanUs.toDouble() / videoDurationUs.toDouble()
                if (coverage < 0.95) {
                    return "warning_low_coverage_${String.format("%.0f", coverage * 100)}pct"
                }
            }

            "ok"
        } finally {
            v.release()
        }
    }

    // ── GPMF binary builder ───────────────────────────────────────────────────
    //
    // GPMF KLV format (big-endian):
    //   [4B FourCC][1B type][1B element-size][2B repeat-count][data padded to 4B]
    //
    // Container (DEVC, STRM): type=0x00, size=4, repeat=inner_len/4
    // String ('c'):           type=0x63, size=1, repeat=strlen
    // Int16 ('s'):            type=0x73, size=2, repeat=1
    // UInt32 ('L'):           type=0x4C, size=4, repeat=1
    // Float32 ('f'):          type=0x66, size=12 (3 axes × 4B), repeat=N samples

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

    private fun gpmfFloat3d(fourCC: String, samples: List<ImuSample>): ByteArray {
        if (samples.isEmpty()) return hdr(fourCC, 0x66.toByte(), 12, 0)
        val data = ByteBuffer.allocate(12 * samples.size).order(ByteOrder.BIG_ENDIAN).apply {
            for (s in samples) { putFloat(s.x); putFloat(s.y); putFloat(s.z) }
        }.array()
        return hdr(fourCC, 0x66.toByte(), 12, samples.size.toShort()) + data
    }

    private fun buildAccelStream(samples: List<ImuSample>): ByteArray =
        gpmfContainer("STRM",
            gpmfString("STNM", "Accelerometer") +
            gpmfString("SIUN", "m/s2") +
            gpmfInt16("SCAL", 1) +
            gpmfUint32("TSMP", samples.size) +
            gpmfFloat3d("ACCL", samples))

    private fun buildGyroStream(samples: List<ImuSample>): ByteArray =
        gpmfContainer("STRM",
            gpmfString("STNM", "Gyroscope") +
            gpmfString("SIUN", "rad/s") +
            gpmfInt16("SCAL", 1) +
            gpmfUint32("TSMP", samples.size) +
            gpmfFloat3d("GYRO", samples))

    private fun buildGpmfPayload(accelList: List<ImuSample>, gyroList: List<ImuSample>): ByteArray =
        gpmfContainer("DEVC",
            gpmfString("DVNM", "Tarzi Mobile") +
            buildAccelStream(accelList) +
            buildGyroStream(gyroList))
}
