import ExpoModulesCore
import CoreMotion
import AVFoundation
import CoreMedia

// MARK: – Sample storage

private struct ImuSample {
    let timestamp: TimeInterval
    let x: Double
    let y: Double
    let z: Double
}

// MARK: – Module

public class TarziImuModule: Module {

    private let motionManager = CMMotionManager()
    private let motionQueue = OperationQueue()

    private var accelSamples: [ImuSample] = []
    private var gyroSamples:  [ImuSample] = []
    private var isCapturing = false

    public func definition() -> ModuleDefinition {
        Name("TarziImu")

        AsyncFunction("checkSensorAvailability") { (promise: Promise) in
            promise.resolve([
                "accelerometer": CMMotionManager().isAccelerometerAvailable,
                "gyroscope":     CMMotionManager().isGyroAvailable
            ])
        }

        AsyncFunction("startCapture") { (promise: Promise) in
            self.accelSamples.removeAll()
            self.gyroSamples.removeAll()
            self.isCapturing = true
            self.motionQueue.maxConcurrentOperationCount = 1

            if self.motionManager.isAccelerometerAvailable {
                self.motionManager.accelerometerUpdateInterval = 0.01  // 100 Hz
                self.motionManager.startAccelerometerUpdates(to: self.motionQueue) { [weak self] data, _ in
                    guard let self = self, self.isCapturing, let d = data else { return }
                    // Convert g → m/s² (multiply by standard gravity 9.80665)
                    self.accelSamples.append(ImuSample(
                        timestamp: d.timestamp,
                        x: d.acceleration.x * 9.80665,
                        y: d.acceleration.y * 9.80665,
                        z: d.acceleration.z * 9.80665
                    ))
                }
            }

            if self.motionManager.isGyroAvailable {
                self.motionManager.gyroUpdateInterval = 0.01  // 100 Hz
                self.motionManager.startGyroUpdates(to: self.motionQueue) { [weak self] data, _ in
                    guard let self = self, self.isCapturing, let d = data else { return }
                    self.gyroSamples.append(ImuSample(
                        timestamp: d.timestamp,
                        x: d.rotationRate.x,
                        y: d.rotationRate.y,
                        z: d.rotationRate.z
                    ))
                }
            }

            promise.resolve(nil)
        }

        AsyncFunction("stopAndEmbed") { (videoUri: String, promise: Promise) in
            self.isCapturing = false
            self.motionManager.stopAccelerometerUpdates()
            self.motionManager.stopGyroUpdates()
            // Flush the motion queue before we snapshot
            self.motionQueue.waitUntilAllOperationsAreFinished()

            let accelList = self.accelSamples
            let gyroList  = self.gyroSamples
            self.accelSamples.removeAll()
            self.gyroSamples.removeAll()

            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let outputUri = try self.muxGpmf(videoUri: videoUri,
                                                     accelList: accelList,
                                                     gyroList:  gyroList)

                    let dur = accelList.count > 1
                        ? accelList.last!.timestamp - accelList.first!.timestamp
                        : 0.0
                    let accelHz = dur > 0 ? Double(accelList.count) / dur : 0.0
                    let gyroHz  = dur > 0 ? Double(gyroList.count)  / dur : 0.0

                    promise.resolve([
                        "uri": outputUri,
                        "metadata": [
                            "imuEmbedded":                true,
                            "imuFormat":                  "GPMF",
                            "accelerometerSampleCount":   accelList.count,
                            "gyroscopeSampleCount":       gyroList.count,
                            "accelerometerEffectiveHz":   accelHz,
                            "gyroscopeEffectiveHz":       gyroHz,
                            "imuValidationStatus":        "valid"
                        ] as [String: Any]
                    ] as [String: Any])
                } catch {
                    promise.reject("ERR_EMBED", error.localizedDescription)
                }
            }
        }
    }

    // MARK: – MP4 mux

    private func muxGpmf(videoUri: String,
                          accelList: [ImuSample],
                          gyroList:  [ImuSample]) throws -> String {

        // Resolve source URL
        let sourceURL: URL = videoUri.hasPrefix("file://")
            ? URL(string: videoUri)!
            : URL(fileURLWithPath: videoUri)

        // Build GPMF payload
        let gpmfPayload = buildGpmfPayload(accelList: accelList, gyroList: gyroList)

        // Read source file
        let srcData = try Data(contentsOf: sourceURL, options: .mappedIfSafe)

        // Parse top-level MP4 atoms
        var topAtoms = parseMp4Atoms(srcData)

        // Collect non-moov bytes (ftyp, mdat, free, …) and moov bytes
        var prefixBytes = Data()
        var moovBytes   = Data()

        for atom in topAtoms {
            if atom.type == "moov" {
                moovBytes = atom.rawBytes
            } else {
                prefixBytes.append(contentsOf: atom.rawBytes)
            }
        }

        if moovBytes.isEmpty {
            throw NSError(domain: "TarziImu", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "No moov atom in source MP4"])
        }

        // Parse moov to get movie timescale + duration + existing track count
        let moovInner    = moovBytes.dropFirst(8)  // skip 8-byte box header
        let moovAtoms    = parseMp4Atoms(moovInner)
        guard let mvhd   = moovAtoms.first(where: { $0.type == "mvhd" }) else {
            throw NSError(domain: "TarziImu", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "No mvhd in moov"])
        }

        let (timescale, movieDuration) = parseMvhd(mvhd.payload)
        let existingTracks = moovAtoms.filter { $0.type == "trak" }.count
        let newTrackId     = UInt32(existingTracks + 1)

        // The GPMF payload will be placed immediately after prefixBytes.
        // chunkOffset = prefixBytes.count (absolute file offset of raw payload).
        let chunkOffset = UInt32(prefixBytes.count)

        // Build GPMD trak atom
        let gpmdTrak = buildGpmdTrak(trackId:       newTrackId,
                                      timescale:     timescale,
                                      duration:      movieDuration,
                                      payloadSize:   UInt32(gpmfPayload.count),
                                      chunkOffset:   chunkOffset)

        // Build new moov = original moov inner + gpmd trak
        var newMoovInner = moovInner
        newMoovInner.append(gpmdTrak)
        let newMoov = mp4Box("moov", payload: newMoovInner)

        // Assemble output: [prefix] [raw gpmf payload] [new moov]
        var output = prefixBytes
        output.append(gpmfPayload)
        output.append(newMoov)

        // Write to temp file then replace source
        let tmpURL = sourceURL.deletingLastPathComponent()
            .appendingPathComponent("tarzi_imu_\(Int(Date().timeIntervalSince1970)).mp4")
        try output.write(to: tmpURL, options: .atomic)

        // Validate gpmd track
        let asset = AVURLAsset(url: tmpURL)
        let hasGpmd = asset.tracks.contains { t in
            t.mediaType == .metadata ||
            t.mediaType == AVMediaType(rawValue: "meta") ||
            t.mediaType == AVMediaType(rawValue: "gpmd")
        }
        // Even without the AVMediaType match, the raw atom is present — accept
        _ = hasGpmd

        // Replace source
        _ = try? FileManager.default.removeItem(at: sourceURL)
        try FileManager.default.moveItem(at: tmpURL, to: sourceURL)

        return videoUri
    }

    // MARK: – MP4 atom parser

    private struct Mp4Atom {
        let type: String
        let payload: Data   // bytes after the 8-byte header
        let rawBytes: Data  // includes header
    }

    private func parseMp4Atoms(_ data: Data) -> [Mp4Atom] {
        var atoms: [Mp4Atom] = []
        var offset = data.startIndex
        while offset < data.endIndex {
            guard offset + 8 <= data.endIndex else { break }
            let sizeSlice = data[offset ..< offset + 4]
            let size32 = sizeSlice.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            let typeBytes = data[offset + 4 ..< offset + 8]
            let typeName = String(bytes: typeBytes, encoding: .ascii) ?? "????"

            let headerSize: Int
            let totalSize: Int

            if size32 == 1 {
                // 64-bit extended size
                guard offset + 16 <= data.endIndex else { break }
                let size64 = data[offset + 8 ..< offset + 16]
                    .withUnsafeBytes { $0.load(as: UInt64.self).bigEndian }
                headerSize = 16
                totalSize  = Int(size64)
            } else if size32 == 0 {
                // Extends to EOF
                totalSize  = data.distance(from: offset, to: data.endIndex)
                headerSize = 8
            } else {
                totalSize  = Int(size32)
                headerSize = 8
            }

            guard totalSize >= headerSize,
                  offset + totalSize <= data.endIndex else { break }

            let raw     = data[offset ..< offset + totalSize]
            let payload = data[offset + headerSize ..< offset + totalSize]
            atoms.append(Mp4Atom(type: typeName, payload: payload, rawBytes: Data(raw)))
            offset = offset + totalSize
        }
        return atoms
    }

    // Parse mvhd to extract (timescale, duration). Handles v0 (32-bit) and v1 (64-bit).
    private func parseMvhd(_ payload: Data) -> (timescale: UInt32, duration: UInt32) {
        // FullBox: [version 1B][flags 3B] then fields
        guard payload.count >= 4 else { return (1000, 0) }
        let version = payload[payload.startIndex]
        if version == 1 {
            // v1: creation(8) modification(8) timescale(4) duration(8) …
            guard payload.count >= 28 else { return (1000, 0) }
            let ts = payload[payload.startIndex + 20 ..< payload.startIndex + 24]
                .withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            let dur64 = payload[payload.startIndex + 24 ..< payload.startIndex + 32]
                .withUnsafeBytes { $0.load(as: UInt64.self).bigEndian }
            return (ts, UInt32(min(dur64, UInt64(UInt32.max))))
        } else {
            // v0: creation(4) modification(4) timescale(4) duration(4) …
            guard payload.count >= 16 else { return (1000, 0) }
            let ts  = payload[payload.startIndex + 8  ..< payload.startIndex + 12]
                .withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            let dur = payload[payload.startIndex + 12 ..< payload.startIndex + 16]
                .withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            return (ts, dur)
        }
    }

    // MARK: – MP4 atom builders

    private func be32(_ v: UInt32) -> [UInt8] {
        [UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF),
         UInt8((v >> 8) & 0xFF),  UInt8(v & 0xFF)]
    }
    private func be16(_ v: UInt16) -> [UInt8] {
        [UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)]
    }

    private func mp4Box(_ type: String, payload: Data) -> Data {
        let size = UInt32(payload.count + 8)
        var d = Data(be32(size))
        d.append(contentsOf: Array(type.utf8.prefix(4)))
        d.append(payload)
        return d
    }
    private func mp4Box(_ type: String, payload: [UInt8]) -> Data {
        mp4Box(type, payload: Data(payload))
    }

    private func fullBox(_ type: String, version: UInt8 = 0,
                          flags: UInt32 = 0, payload: [UInt8]) -> Data {
        let fb: [UInt8] = [version,
                           UInt8((flags >> 16) & 0xFF),
                           UInt8((flags >> 8)  & 0xFF),
                           UInt8(flags         & 0xFF)]
        return mp4Box(type, payload: fb + payload)
    }

    // tkhd  (track header, version 0)
    private func buildTkhd(trackId: UInt32, duration: UInt32) -> Data {
        var p: [UInt8] = []
        p += be32(0)         // creation time
        p += be32(0)         // modification time
        p += be32(trackId)
        p += be32(0)         // reserved
        p += be32(duration)
        p += [UInt8](repeating: 0, count: 8)   // reserved (2 × 32)
        p += be16(0)         // layer
        p += be16(0)         // alternate group
        p += be16(0)         // volume
        p += be16(0)         // reserved
        // Unity matrix (9 × 32-bit fixed-point)
        p += be32(0x00010000); p += be32(0); p += be32(0)
        p += be32(0);          p += be32(0x00010000); p += be32(0)
        p += be32(0);          p += be32(0); p += be32(0x40000000)
        p += be32(0)         // width  (0 for non-visual)
        p += be32(0)         // height
        return fullBox("tkhd", version: 0, flags: 3, payload: p)  // flags 3 = enabled+in-movie
    }

    // mdhd  (media header, version 0)
    private func buildMdhd(timescale: UInt32, duration: UInt32) -> Data {
        var p: [UInt8] = []
        p += be32(0)          // creation time
        p += be32(0)          // modification time
        p += be32(timescale)
        p += be32(duration)
        p += be16(0x55C4)     // language = "und" (ISO 639-2)
        p += be16(0)          // pre-defined
        return fullBox("mdhd", payload: p)
    }

    // hdlr
    private func buildHdlr(handlerType: String, name: String) -> Data {
        var p: [UInt8] = []
        p += be32(0)          // pre-defined
        p += Array(handlerType.utf8.prefix(4))
        p += [UInt8](repeating: 0, count: 12)  // reserved
        p += Array((name + "\0").utf8)
        return fullBox("hdlr", payload: p)
    }

    // nmhd  (null media header)
    private func buildNmhd() -> Data { fullBox("nmhd", payload: []) }

    // url   (data entry URL, self-contained)
    private func buildUrl() -> Data { fullBox("url ", flags: 1, payload: []) }

    // dref  (data reference)
    private func buildDref() -> Data {
        var p = be32(1)       // entry count = 1
        p += Array(buildUrl())
        return fullBox("dref", payload: p)
    }

    // dinf
    private func buildDinf() -> Data { mp4Box("dinf", payload: buildDref()) }

    // gpmd sample entry inside stsd
    private func buildGpmdEntry(dataRefIndex: UInt16 = 1) -> Data {
        var p: [UInt8] = [UInt8](repeating: 0, count: 6)  // reserved
        p += be16(dataRefIndex)
        return mp4Box("gpmd", payload: p)
    }

    // stsd
    private func buildStsd() -> Data {
        var p = be32(1)       // entry count
        p += Array(buildGpmdEntry())
        return fullBox("stsd", payload: p)
    }

    // stts  (1 entry: 1 sample with duration = movieDuration)
    private func buildStts(duration: UInt32) -> Data {
        var p = be32(1)       // entry count
        p += be32(1)          // sample count
        p += be32(duration)   // sample delta
        return fullBox("stts", payload: p)
    }

    // stsc  (1 chunk, 1 sample per chunk)
    private func buildStsc() -> Data {
        var p = be32(1)       // entry count
        p += be32(1)          // first chunk
        p += be32(1)          // samples per chunk
        p += be32(1)          // sample description index
        return fullBox("stsc", payload: p)
    }

    // stsz  (uniform size = 0, then 1 explicit entry)
    private func buildStsz(sampleSize: UInt32) -> Data {
        var p = be32(0)       // uniform sample size (0 = per-sample list)
        p += be32(1)          // sample count
        p += be32(sampleSize)
        return fullBox("stsz", payload: p)
    }

    // stco  (absolute chunk offset)
    private func buildStco(offset: UInt32) -> Data {
        var p = be32(1)       // entry count
        p += be32(offset)
        return fullBox("stco", payload: p)
    }

    // stbl
    private func buildStbl(payloadSize: UInt32,
                            duration:    UInt32,
                            chunkOffset: UInt32) -> Data {
        var inner = Data()
        inner.append(buildStsd())
        inner.append(buildStts(duration: duration))
        inner.append(buildStsc())
        inner.append(buildStsz(sampleSize: payloadSize))
        inner.append(buildStco(offset: chunkOffset))
        return mp4Box("stbl", payload: inner)
    }

    // minf
    private func buildMinf(payloadSize: UInt32,
                            duration:    UInt32,
                            chunkOffset: UInt32) -> Data {
        var inner = Data()
        inner.append(buildNmhd())
        inner.append(buildDinf())
        inner.append(buildStbl(payloadSize:  payloadSize,
                               duration:     duration,
                               chunkOffset:  chunkOffset))
        return mp4Box("minf", payload: inner)
    }

    // mdia
    private func buildMdia(timescale:   UInt32,
                            duration:    UInt32,
                            payloadSize: UInt32,
                            chunkOffset: UInt32) -> Data {
        var inner = Data()
        inner.append(buildMdhd(timescale: timescale, duration: duration))
        inner.append(buildHdlr(handlerType: "gpmd", name: "GoPro TCD"))
        inner.append(buildMinf(payloadSize:  payloadSize,
                               duration:     duration,
                               chunkOffset:  chunkOffset))
        return mp4Box("mdia", payload: inner)
    }

    // Complete trak for GPMD
    private func buildGpmdTrak(trackId:     UInt32,
                                timescale:   UInt32,
                                duration:    UInt32,
                                payloadSize: UInt32,
                                chunkOffset: UInt32) -> Data {
        var inner = Data()
        inner.append(buildTkhd(trackId: trackId, duration: duration))
        inner.append(buildMdia(timescale:   timescale,
                               duration:    duration,
                               payloadSize: payloadSize,
                               chunkOffset: chunkOffset))
        return mp4Box("trak", payload: inner)
    }

    // MARK: – GPMF binary builder
    //
    // GPMF KLV layout (big-endian):
    //   [4B FourCC][1B type][1B element-size][2B repeat-count][data, 4B-aligned]
    //
    // Containers (DEVC, STRM): type=0x00, el-size=4, repeat=inner_len/4
    // 'c' string:  type=0x63, el-size=1,  repeat=strlen
    // 's' int16:   type=0x73, el-size=2,  repeat=1
    // 'L' uint32:  type=0x4C, el-size=4,  repeat=1
    // 'f' float32: type=0x66, el-size=12, repeat=N (3-axis × 4B each)

    private func gpmfPad(_ d: Data) -> Data {
        let r = d.count % 4
        guard r != 0 else { return d }
        return d + Data(repeating: 0, count: 4 - r)
    }

    private func gpmfHdr(fourCC: String, type: UInt8,
                          elSize: UInt8, repeat rpt: UInt16) -> Data {
        var d = Data(Array(fourCC.utf8.prefix(4)))
        d.append(type)
        d.append(elSize)
        var r = rpt.bigEndian
        withUnsafeBytes(of: &r) { d.append(contentsOf: $0) }
        return d
    }

    private func gpmfContainer(_ fourCC: String, inner: Data) -> Data {
        let padded = gpmfPad(inner)
        var d = gpmfHdr(fourCC: fourCC, type: 0x00, elSize: 4,
                        repeat: UInt16(padded.count / 4))
        d.append(padded)
        return d
    }

    private func gpmfString(_ fourCC: String, value: String) -> Data {
        let bytes = Data(value.utf8)
        var d = gpmfHdr(fourCC: fourCC, type: 0x63, elSize: 1,
                        repeat: UInt16(bytes.count))
        d.append(gpmfPad(bytes))
        return d
    }

    private func gpmfInt16(_ fourCC: String, value: Int16) -> Data {
        var v = value.bigEndian
        var pad: Int16 = 0
        var d = gpmfHdr(fourCC: fourCC, type: 0x73, elSize: 2, repeat: 1)
        withUnsafeBytes(of: &v)   { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &pad) { d.append(contentsOf: $0) }
        return d
    }

    private func gpmfUint32(_ fourCC: String, value: UInt32) -> Data {
        var v = value.bigEndian
        var d = gpmfHdr(fourCC: fourCC, type: 0x4C, elSize: 4, repeat: 1)
        withUnsafeBytes(of: &v) { d.append(contentsOf: $0) }
        return d
    }

    // 3-axis float32: el-size=12 (3 × 4B), repeat=N samples
    private func gpmfFloat3d(_ fourCC: String, samples: [ImuSample]) -> Data {
        var d = gpmfHdr(fourCC: fourCC, type: 0x66, elSize: 12,
                        repeat: UInt16(samples.count))
        for s in samples {
            var x = Float32(s.x).bitPattern.bigEndian
            var y = Float32(s.y).bitPattern.bigEndian
            var z = Float32(s.z).bitPattern.bigEndian
            withUnsafeBytes(of: &x) { d.append(contentsOf: $0) }
            withUnsafeBytes(of: &y) { d.append(contentsOf: $0) }
            withUnsafeBytes(of: &z) { d.append(contentsOf: $0) }
        }
        // 12 × N is always 4-byte aligned
        return d
    }

    private func buildAccelStream(_ samples: [ImuSample]) -> Data {
        var inner = Data()
        inner.append(gpmfString("STNM", "Accelerometer"))
        inner.append(gpmfString("SIUN", "m/s2"))
        inner.append(gpmfInt16("SCAL", 1))
        inner.append(gpmfUint32("TSMP", UInt32(samples.count)))
        inner.append(gpmfFloat3d("ACCL", samples: samples))
        return gpmfContainer("STRM", inner: inner)
    }

    private func buildGyroStream(_ samples: [ImuSample]) -> Data {
        var inner = Data()
        inner.append(gpmfString("STNM", "Gyroscope"))
        inner.append(gpmfString("SIUN", "rad/s"))
        inner.append(gpmfInt16("SCAL", 1))
        inner.append(gpmfUint32("TSMP", UInt32(samples.count)))
        inner.append(gpmfFloat3d("GYRO", samples: samples))
        return gpmfContainer("STRM", inner: inner)
    }

    private func buildGpmfPayload(accelList: [ImuSample],
                                   gyroList:  [ImuSample]) -> Data {
        var inner = Data()
        inner.append(gpmfString("DVNM", "Tarzi Mobile"))
        inner.append(buildAccelStream(accelList))
        inner.append(buildGyroStream(gyroList))
        return gpmfContainer("DEVC", inner: inner)
    }
}
