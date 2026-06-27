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
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CopyOnWriteArrayList

private data class ImuSample(
    val timestampNs: Long,
    val x: Float,
    val y: Float,
    val z: Float
)

class TarziImuModule : Module() {

    private var sensorManager: SensorManager? = null
    private var accelSensor: Sensor? = null
    private var gyroSensor: Sensor? = null

    private val accelSamples = CopyOnWriteArrayList<ImuSample>()
    private val gyroSamples = CopyOnWriteArrayList<ImuSample>()

    @Volatile
    private var isCapturing = false
    private var captureStartNs = 0L

    private val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            if (!isCapturing) return
            val s = ImuSample(event.timestamp, event.values[0], event.values[1], event.values[2])
            when (event.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> accelSamples.add(s)
                Sensor.TYPE_GYROSCOPE -> gyroSamples.add(s)
            }
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    override fun definition() = ModuleDefinition {
        Name("TarziImu")

        AsyncFunction("checkSensorAvailability") { promise: Promise ->
            val ctx = appContext.reactContext
            val sm = ctx?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            promise.resolve(mapOf(
                "accelerometer" to (sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null),
                "gyroscope" to (sm?.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null)
            ))
        }

        AsyncFunction("startCapture") { promise: Promise ->
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR_NO_CTX", "No React context", null)
            sensorManager = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            accelSensor = sensorManager!!.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            gyroSensor = sensorManager!!.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
            accelSamples.clear()
            gyroSamples.clear()
            captureStartNs = SystemClock.elapsedRealtimeNanos()
            isCapturing = true
            accelSensor?.let {
                sensorManager!!.registerListener(listener, it, SensorManager.SENSOR_DELAY_GAME)
            }
            gyroSensor?.let {
                sensorManager!!.registerListener(listener, it, SensorManager.SENSOR_DELAY_GAME)
            }
            promise.resolve(null)
        }

        AsyncFunction("stopAndEmbed") { videoUri: String, promise: Promise ->
            isCapturing = false
            sensorManager?.unregisterListener(listener)

            val captureEndNs = SystemClock.elapsedRealtimeNanos()
            val durationSec = (captureEndNs - captureStartNs).toDouble() / 1_000_000_000.0

            val accelList = ArrayList(accelSamples)
            val gyroList = ArrayList(gyroSamples)
            accelSamples.clear()
            gyroSamples.clear()

            Thread {
                try {
                    val outputUri = muxGpmf(videoUri, accelList, gyroList)
                    val accelHz = if (durationSec > 0) accelList.size / durationSec else 0.0
                    val gyroHz = if (durationSec > 0) gyroList.size / durationSec else 0.0
                    promise.resolve(mapOf(
                        "uri" to outputUri,
                        "metadata" to mapOf(
                            "imuEmbedded" to true,
                            "imuFormat" to "GPMF",
                            "accelerometerSampleCount" to accelList.size,
                            "gyroscopeSampleCount" to gyroList.size,
                            "accelerometerEffectiveHz" to accelHz,
                            "gyroscopeEffectiveHz" to gyroHz,
                            "imuValidationStatus" to "valid"
                        )
                    ))
                } catch (e: Exception) {
                    promise.reject("ERR_EMBED", e.message ?: "embed failed", e)
                }
            }.start()
        }
    }

    // ── MP4 muxing ───────────────────────────────────────────────────────────

    private fun muxGpmf(
        sourceUri: String,
        accelList: List<ImuSample>,
        gyroList: List<ImuSample>
    ): String {
        val gpmfPayload = buildGpmfPayload(accelList, gyroList)
        val ctx = appContext.reactContext!!

        // Resolve file path (strip file:// scheme)
        val sourcePath = if (sourceUri.startsWith("file://"))
            sourceUri.removePrefix("file://")
        else sourceUri
        val sourceFile = File(sourcePath)

        val outFile = File(ctx.cacheDir, "tarzi_imu_${System.currentTimeMillis()}.mp4")

        val extractor = MediaExtractor()
        extractor.setDataSource(sourcePath)
        val trackCount = extractor.trackCount

        val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        // Add all existing tracks and map extractor → muxer indices
        val trackMap = mutableMapOf<Int, Int>()
        for (i in 0 until trackCount) {
            val fmt = extractor.getTrackFormat(i)
            trackMap[i] = muxer.addTrack(fmt)
        }

        // Add the GPMD metadata track
        val gpmdFmt = MediaFormat()
        gpmdFmt.setString(MediaFormat.KEY_MIME, "application/gpmd")
        val gpmdIdx = muxer.addTrack(gpmdFmt)

        muxer.start()

        // Copy each source track's samples sequentially
        val buf = ByteBuffer.allocate(5 * 1024 * 1024)
        val info = MediaCodec.BufferInfo()

        for (extIdx in 0 until trackCount) {
            extractor.selectTrack(extIdx)
            extractor.seekTo(0L, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
            val muxIdx = trackMap[extIdx]!!
            while (true) {
                buf.clear()
                val sz = extractor.readSampleData(buf, 0)
                if (sz < 0) break
                info.apply {
                    offset = 0
                    size = sz
                    presentationTimeUs = extractor.sampleTime
                    flags = extractor.sampleFlags
                }
                muxer.writeSampleData(muxIdx, buf, info)
                extractor.advance()
            }
            extractor.unselectTrack(extIdx)
        }

        // Write GPMF payload as a single sample at t=0
        val gpmfBuf = ByteBuffer.wrap(gpmfPayload)
        info.apply {
            offset = 0
            size = gpmfPayload.size
            presentationTimeUs = 0L
            flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
        }
        muxer.writeSampleData(gpmdIdx, gpmfBuf, info)

        muxer.stop()
        muxer.release()
        extractor.release()

        // Validate: confirm gpmd track exists in the output
        validateGpmdTrack(outFile.absolutePath)

        // Swap files: replace source with output
        sourceFile.delete()
        if (!outFile.renameTo(sourceFile)) {
            outFile.copyTo(sourceFile, overwrite = true)
            outFile.delete()
        }

        return sourceUri
    }

    private fun validateGpmdTrack(path: String) {
        val v = MediaExtractor()
        v.setDataSource(path)
        val hasGpmd = (0 until v.trackCount).any { i ->
            val fmt = v.getTrackFormat(i)
            fmt.getString(MediaFormat.KEY_MIME)?.contains("gpmd", ignoreCase = true) == true
        }
        v.release()
        if (!hasGpmd) throw RuntimeException("GPMD track not found in output MP4")
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
    // Float32 ('f'):          type=0x66, size=12 (3 floats), repeat=N samples

    private fun pad4(data: ByteArray): ByteArray {
        val rem = data.size % 4
        if (rem == 0) return data
        return data + ByteArray(4 - rem)
    }

    private fun hdr(fourCC: String, type: Byte, size: Byte, repeat: Short): ByteArray =
        ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN)
            .put(fourCC.toByteArray(Charsets.US_ASCII))
            .put(type)
            .put(size)
            .putShort(repeat)
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

    // 3-axis float32 stream: each sample is [x, y, z] = 12 bytes
    private fun gpmfFloat3d(fourCC: String, samples: List<ImuSample>): ByteArray {
        if (samples.isEmpty()) {
            return hdr(fourCC, 0x66.toByte(), 12, 0)
        }
        val data = ByteBuffer.allocate(12 * samples.size).order(ByteOrder.BIG_ENDIAN).apply {
            for (s in samples) { putFloat(s.x); putFloat(s.y); putFloat(s.z) }
        }.array()
        // 12 bytes per sample is always 4-byte aligned, no extra padding needed
        return hdr(fourCC, 0x66.toByte(), 12, samples.size.toShort()) + data
    }

    private fun buildAccelStream(samples: List<ImuSample>): ByteArray {
        val inner = gpmfString("STNM", "Accelerometer") +
            gpmfString("SIUN", "m/s2") +
            gpmfInt16("SCAL", 1) +
            gpmfUint32("TSMP", samples.size) +
            gpmfFloat3d("ACCL", samples)
        return gpmfContainer("STRM", inner)
    }

    private fun buildGyroStream(samples: List<ImuSample>): ByteArray {
        val inner = gpmfString("STNM", "Gyroscope") +
            gpmfString("SIUN", "rad/s") +
            gpmfInt16("SCAL", 1) +
            gpmfUint32("TSMP", samples.size) +
            gpmfFloat3d("GYRO", samples)
        return gpmfContainer("STRM", inner)
    }

    private fun buildGpmfPayload(
        accelList: List<ImuSample>,
        gyroList: List<ImuSample>
    ): ByteArray {
        val inner = gpmfString("DVNM", "Tarzi Mobile") +
            buildAccelStream(accelList) +
            buildGyroStream(gyroList)
        return gpmfContainer("DEVC", inner)
    }
}
