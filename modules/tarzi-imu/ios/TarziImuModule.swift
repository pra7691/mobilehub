import ExpoModulesCore
import CoreMotion
import AVFoundation
import CoreMedia

// MARK: – Sample storage

private struct ImuSample {
    let timestamp: TimeInterval   // seconds since boot (ProcessInfo.processInfo.systemUptime epoch)
    let x: Double
    let y: Double
    let z: Double
}

// MARK: – Module

public class TarziImuModule: Module {

    private let motionManager = CMMotionManager()
    private let motionQueue   = OperationQueue()

    private var accelSamples: [ImuSample] = []
    private var gyroSamples:  [ImuSample] = []
    private var isCapturing   = false
    private var captureStartSec: TimeInterval = 0.0

    // Disk streaming
    private var diskHandle:       FileHandle? = nil
    private let diskLock          = NSLock()
    private var pendingDiskCount  = 0
    private let DISK_FLUSH_INTERVAL = 200

    public func definition() -> ModuleDefinition {
        Name("TarziImu")

        // ── Availability ────────────────────────────────────────────────────

        AsyncFunction("checkSensorAvailability") { (promise: Promise) in
            promise.resolve([
                "accelerometer": CMMotionManager().isAccelerometerAvailable,
                "gyroscope":     CMMotionManager().isGyroAvailable
            ])
        }

        // ── startCapture ────────────────────────────────────────────────────
        //
        // @param imuTempFilePath  Optional path for incremental TIMU disk streaming.
        //   When provided, a 13-byte TIMU header is written at open time and then
        //   21-byte records are appended for every sensor sample. Samples are
        //   flushed every DISK_FLUSH_INTERVAL writes. Requires an EAS build that
        //   includes write permission for the given directory (documentDirectory
        //   or cacheDirectory both work; use ensureImuDir() from JS to create it).
        // @param taskId  Diagnostic identifier only — not stored in the TIMU file.

        AsyncFunction("startCapture") { (imuTempFilePath: String?, taskId: String?, promise: Promise) in
            self.accelSamples.removeAll()
            self.gyroSamples.removeAll()
            self.closeDiskLocked()

            self.captureStartSec = ProcessInfo.processInfo.systemUptime
            self.isCapturing = true
            self.motionQueue.maxConcurrentOperationCount = 1

            if let path = imuTempFilePath, !path.isEmpty {
                self.openDiskFile(path: path)
            }

            if self.motionManager.isAccelerometerAvailable {
                self.motionManager.accelerometerUpdateInterval = 0.01   // 100 Hz
                self.motionManager.startAccelerometerUpdates(to: self.motionQueue) { [weak self] data, _ in
                    guard let self, self.isCapturing, let d = data else { return }
                    let s = ImuSample(timestamp: d.timestamp,
                                      x: d.acceleration.x * 9.80665,
                                      y: d.acceleration.y * 9.80665,
                                      z: d.acceleration.z * 9.80665)
                    self.accelSamples.append(s)
                    self.appendSampleToDisk(type: 0x00, sample: s)
                }
            }

            if self.motionManager.isGyroAvailable {
                self.motionManager.gyroUpdateInterval = 0.01            // 100 Hz
                self.motionManager.startGyroUpdates(to: self.motionQueue) { [weak self] data, _ in
                    guard let self, self.isCapturing, let d = data else { return }
                    let s = ImuSample(timestamp: d.timestamp,
                                      x: d.rotationRate.x,
                                      y: d.rotationRate.y,
                                      z: d.rotationRate.z)
                    self.gyroSamples.append(s)
                    self.appendSampleToDisk(type: 0x01, sample: s)
                }
            }

            promise.resolve(nil)
        }

        // ── stopAndEmbed ────────────────────────────────────────────────────

        AsyncFunction("stopAndEmbed") { (videoUri: String, promise: Promise) in
            self.isCapturing = false
            self.motionManager.stopAccelerometerUpdates()
            self.motionManager.stopGyroUpdates()
            // Drain in-flight sensor callbacks before snapshotting
            self.motionQueue.waitUntilAllOperationsAreFinished()

            let accelList      = self.accelSamples
            let gyroList       = self.gyroSamples
            self.accelSamples.removeAll()
            self.gyroSamples.removeAll()
            let captureStart   = self.captureStartSec
            self.finalizeDisk()

            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let (outputUri, validationStatus) = try self.muxGpmf(
                        videoUri:        videoUri,
                        accelList:       accelList,
                        gyroList:        gyroList,
                        captureStartSec: captureStart,
                        outputPath:      nil
                    )
                    let dur    = accelList.count > 1 ? accelList.last!.timestamp - accelList.first!.timestamp : 0.0
                    let accelHz = dur > 0 ? Double(accelList.count) / dur : 0.0
                    let gyroHz  = dur > 0 ? Double(gyroList.count)  / dur : 0.0
                    promise.resolve(self.buildResult(
                        uri: outputUri, validationStatus: validationStatus,
                        accelCount: accelList.count, gyroCount: gyroList.count,
                        accelHz: accelHz, gyroHz: gyroHz))
                } catch {
                    promise.reject("ERR_EMBED", error.localizedDescription)
                }
            }
        }

        // ── resumeEmbed ─────────────────────────────────────────────────────
        //
        // Called by imuRecovery.ts on app restart when a PROCESSING_IMU draft is
        // found.  Reads a persisted TIMU file, re-muxes IMU into the raw video,
        // and writes the result to outputUri WITHOUT touching rawVideoUri or
        // imuTempFilePath.  The caller deletes those only after imuEmbedded = true.
        //
        // Fails with ERR_IMU_FILE when the TIMU file is missing, corrupted, or
        // contains an unrecognised version byte.

        AsyncFunction("resumeEmbed") { (rawVideoUri: String, imuTempFilePath: String, outputUri: String, promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let (captureStartSec, accelList, gyroList) = try self.readTimuFile(imuTempFilePath)

                    if accelList.isEmpty && gyroList.isEmpty {
                        promise.reject("ERR_IMU_FILE", "TIMU file contains no IMU samples")
                        return
                    }

                    let (finalUri, validationStatus) = try self.muxGpmf(
                        videoUri:        rawVideoUri,
                        accelList:       accelList,
                        gyroList:        gyroList,
                        captureStartSec: captureStartSec,
                        outputPath:      outputUri
                    )

                    let allTs   = (accelList + gyroList).map { $0.timestamp }
                    let durSec  = (allTs.max() ?? 0) - (allTs.min() ?? 0)
                    let accelHz = durSec > 0 ? Double(accelList.count) / durSec : 0.0
                    let gyroHz  = durSec > 0 ? Double(gyroList.count)  / durSec : 0.0
                    promise.resolve(self.buildResult(
                        uri: finalUri, validationStatus: validationStatus,
                        accelCount: accelList.count, gyroCount: gyroList.count,
                        accelHz: accelHz, gyroHz: gyroHz))
                } catch let e as NSError where e.domain == "TarziImu" {
                    promise.reject("ERR_IMU_FILE", e.localizedDescription)
                } catch {
                    promise.reject("ERR_EMBED", error.localizedDescription)
                }
            }
        }
    }

    // MARK: – Shared result builder

    private func buildResult(uri: String, validationStatus: String,
                              accelCount: Int, gyroCount: Int,
                              accelHz: Double, gyroHz: Double) -> [String: Any] {
        [
            "uri": uri,
            "metadata": [
                "imuEmbedded":               validationStatus == "ok",
                "imuFormat":                 "GPMF",
                "accelerometerSampleCount":  accelCount,
                "gyroscopeSampleCount":      gyroCount,
                "accelerometerEffectiveHz":  accelHz,
                "gyroscopeEffectiveHz":      gyroHz,
                "imuValidationStatus":       validationStatus
            ] as [String: Any]
        ]
    }

    // MARK: – Disk streaming
    //
    // TIMU binary format (big-endian throughout):
    //
    //   Header 13 bytes:
    //     [4] "TIMU"   magic
    //     [1] 0x01     version (reject unknown versions)
    //     [8] captureStartNs (Int64 BE) — ProcessInfo.systemUptime converted to ns
    //
    //   Record 21 bytes (one per sensor sample):
    //     [1] type — 0x00 accel, 0x01 gyro
    //     [8] timestampOffsetNs (Int64 BE) — ns since captureStartSec
    //     [4] x Float32 BE
    //     [4] y Float32 BE
    //     [4] z Float32 BE

    private func openDiskFile(path: String) {
        let url = URL(fileURLWithPath: path)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                     withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: url)                // truncate stale file
            FileManager.default.createFile(atPath: path, contents: nil) // create empty
            let handle = try FileHandle(forWritingTo: url)
            // Write 13-byte header
            var header = Data()
            header.append(contentsOf: "TIMU".utf8)
            header.append(0x01)
            let startNs = Int64(captureStartSec * 1_000_000_000.0)
            var startNsBE = startNs.bigEndian
            withUnsafeBytes(of: &startNsBE) { header.append(contentsOf: $0) }
            handle.write(header)
            diskLock.lock()
            diskHandle = handle
            diskLock.unlock()
        } catch {
            // Disk streaming unavailable — samples remain in memory
        }
    }

    private func appendSampleToDisk(type: UInt8, sample: ImuSample) {
        // Called on motionQueue — no lock needed for the write path,
        // but lock protects diskHandle from concurrent nil-out in finalizeDisk.
        diskLock.lock()
        guard let handle = diskHandle else { diskLock.unlock(); return }
        diskLock.unlock()

        let offsetNs = Int64((sample.timestamp - captureStartSec) * 1_000_000_000.0)
        var rec = Data(capacity: 21)
        rec.append(type)
        var oNs = offsetNs.bigEndian;   withUnsafeBytes(of: &oNs) { rec.append(contentsOf: $0) }
        var xBE = Float(sample.x).bitPattern.bigEndian; withUnsafeBytes(of: &xBE) { rec.append(contentsOf: $0) }
        var yBE = Float(sample.y).bitPattern.bigEndian; withUnsafeBytes(of: &yBE) { rec.append(contentsOf: $0) }
        var zBE = Float(sample.z).bitPattern.bigEndian; withUnsafeBytes(of: &zBE) { rec.append(contentsOf: $0) }
        handle.write(rec)

        pendingDiskCount += 1
        if pendingDiskCount >= DISK_FLUSH_INTERVAL {
            handle.synchronizeFile()
            pendingDiskCount = 0
        }
    }

    private func finalizeDisk() {
        diskLock.lock()
        diskHandle?.synchronizeFile()
        diskHandle?.closeFile()
        diskHandle = nil
        diskLock.unlock()
        pendingDiskCount = 0
    }

    private func closeDiskLocked() {
        diskLock.lock()
        diskHandle?.closeFile()
        diskHandle = nil
        diskLock.unlock()
        pendingDiskCount = 0
    }

    // MARK: – TIMU file reader

    private func readBEInt64(data: Data, at offset: Int) -> Int64 {
        var val: Int64 = 0
        withUnsafeMutableBytes(of: &val) { dst in
            data.copyBytes(to: dst, from: offset ..< offset + 8)
        }
        return Int64(bigEndian: val)
    }

    private func readBEUInt32(data: Data, at offset: Int) -> UInt32 {
        var val: UInt32 = 0
        withUnsafeMutableBytes(of: &val) { dst in
            data.copyBytes(to: dst, from: offset ..< offset + 4)
        }
        return UInt32(bigEndian: val)
    }

    private func readTimuFile(_ path: String) throws -> (captureStartSec: TimeInterval,
                                                          accelSamples: [ImuSample],
                                                          gyroSamples:  [ImuSample]) {
        let url = URL(fileURLWithPath: path)
        guard let data = try? Data(contentsOf: url), data.count >= 13 else {
            throw NSError(domain: "TarziImu", code: 20,
                          userInfo: [NSLocalizedDescriptionKey: "TIMU file missing or too small: \(path)"])
        }
        // Validate magic
        let magic = String(bytes: data[0 ..< 4], encoding: .ascii) ?? ""
        guard magic == "TIMU" else {
            throw NSError(domain: "TarziImu", code: 21,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid TIMU magic bytes"])
        }
        guard data[4] == 0x01 else {
            throw NSError(domain: "TarziImu", code: 22,
                          userInfo: [NSLocalizedDescriptionKey: "Unknown TIMU version 0x\(String(data[4], radix: 16))"])
        }

        let startNs     = readBEInt64(data: data, at: 5)
        let captureStart = TimeInterval(startNs) / 1_000_000_000.0

        var accel: [ImuSample] = []
        var gyro:  [ImuSample] = []
        var offset = 13

        while offset + 21 <= data.count {
            let type      = data[offset]
            let offsetNs  = readBEInt64(data: data, at: offset + 1)
            let xBits     = readBEUInt32(data: data, at: offset + 9)
            let yBits     = readBEUInt32(data: data, at: offset + 13)
            let zBits     = readBEUInt32(data: data, at: offset + 17)
            let sample    = ImuSample(
                timestamp: captureStart + TimeInterval(offsetNs) / 1_000_000_000.0,
                x: Double(Float(bitPattern: xBits)),
                y: Double(Float(bitPattern: yBits)),
                z: Double(Float(bitPattern: zBits))
            )
            switch type {
            case 0x00: accel.append(sample)
            case 0x01: gyro.append(sample)
            default:   break
            }
            offset += 21
        }

        return (captureStart, accel, gyro)
    }

    // MARK: – GPMF chunk builder
    //
    // Splits samples into 1-second windows keyed by floor(timestamp - captureStartSec).
    // Returns chunks sorted by chunkIndex — each will become one MP4 muxer sample
    // with presentationTime = chunkIndex × timescale, giving correct temporal alignment.

    private func buildGpmfChunks(accelList: [ImuSample],
                                   gyroList:  [ImuSample],
                                   captureStartSec: TimeInterval) -> [(payload: Data, chunkIndex: Int)] {
        if accelList.isEmpty && gyroList.isEmpty { return [] }

        var buckets: [Int: (accel: [ImuSample], gyro: [ImuSample])] = [:]

        for s in accelList {
            let ci = max(0, Int(s.timestamp - captureStartSec))
            if buckets[ci] == nil { buckets[ci] = ([], []) }
            buckets[ci]!.accel.append(s)
        }
        for s in gyroList {
            let ci = max(0, Int(s.timestamp - captureStartSec))
            if buckets[ci] == nil { buckets[ci] = ([], []) }
            buckets[ci]!.gyro.append(s)
        }

        return buckets.sorted { $0.key < $1.key }.map { (ci, pair) in
            (payload: buildGpmfPayload(accelList: pair.accel, gyroList: pair.gyro),
             chunkIndex: ci)
        }
    }

    // MARK: – MP4 mux
    //
    // Reads the source MP4 byte-by-byte (memory-mapped), builds a multi-chunk
    // GPMF telemetry track, and writes the result atomically.
    //
    // @param outputPath  When non-nil, write to this path without touching videoUri.
    //                    When nil, replace videoUri in-place (stopAndEmbed path).

    private func muxGpmf(videoUri:        String,
                          accelList:       [ImuSample],
                          gyroList:        [ImuSample],
                          captureStartSec: TimeInterval,
                          outputPath:      String?) throws -> (uri: String, validationStatus: String) {

        let sourceURL: URL = videoUri.hasPrefix("file://")
            ? URL(string: videoUri)!
            : URL(fileURLWithPath: videoUri)

        let srcData = try Data(contentsOf: sourceURL, options: .mappedIfSafe)

        // Parse top-level atoms to separate prefix (ftyp, mdat, …) from moov
        var prefixBytes = Data()
        var moovBytes   = Data()
        for atom in parseMp4Atoms(srcData) {
            if atom.type == "moov" { moovBytes = atom.rawBytes }
            else { prefixBytes.append(contentsOf: atom.rawBytes) }
        }
        guard !moovBytes.isEmpty else {
            throw NSError(domain: "TarziImu", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "No moov atom in source MP4"])
        }

        let moovInner = moovBytes.dropFirst(8)
        let moovAtoms = parseMp4Atoms(moovInner)
        guard let mvhd = moovAtoms.first(where: { $0.type == "mvhd" }) else {
            throw NSError(domain: "TarziImu", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "No mvhd in moov"])
        }

        let (timescale, movieDuration) = parseMvhd(mvhd.payload)
        let existingTracks = moovAtoms.filter { $0.type == "trak" }.count
        let newTrackId     = UInt32(existingTracks + 1)

        // Build GPMF chunks (one per second of recording)
        let chunks = buildGpmfChunks(accelList: accelList, gyroList: gyroList, captureStartSec: captureStartSec)

        // Concatenate all chunk payloads into one mdat payload
        var allPayloads = Data()
        for (payload, _) in chunks { allPayloads.append(payload) }
        if allPayloads.isEmpty {
            allPayloads = buildGpmfPayload(accelList: [], gyroList: [])
        }

        let gpmfMdat = mp4Box("mdat", payload: allPayloads)

        // Compute per-chunk stco offsets:
        //   base = prefixBytes.count + 8  (past the 8-byte gpmfMdat header)
        let baseOffset = UInt32(prefixBytes.count + 8)
        var chunkOffsets: [UInt32] = []
        var running: UInt32 = 0
        for (payload, _) in chunks {
            chunkOffsets.append(baseOffset + running)
            running += UInt32(payload.count)
        }
        // If no chunks, single empty payload at base offset
        if chunkOffsets.isEmpty { chunkOffsets = [baseOffset] }

        // Build trak with chunks info
        let gpmdTrak: Data
        if chunks.isEmpty {
            // Fallback: single sample track (empty payload)
            let emptyChunks = [(payload: allPayloads, chunkOffset: baseOffset)]
            gpmdTrak = buildGpmdTrak(trackId: newTrackId, timescale: timescale, duration: movieDuration, chunks: emptyChunks)
        } else {
            let chunksWithOffsets = zip(chunks, chunkOffsets).map { (c, off) in
                (payload: c.payload, chunkOffset: off)
            }
            gpmdTrak = buildGpmdTrak(trackId: newTrackId, timescale: timescale, duration: movieDuration, chunks: chunksWithOffsets)
        }

        // Rebuild moov
        var newMoovInner = Data(moovInner)
        newMoovInner.append(gpmdTrak)
        let newMoov = mp4Box("moov", payload: newMoovInner)

        // Assemble output bytes
        var output = prefixBytes
        output.append(gpmfMdat)
        output.append(newMoov)

        // Validate in-memory before touching any file
        let validationStatus = validateGpmfOutput(
            output,
            accelCount: accelList.count,
            gyroCount:  gyroList.count,
            chunkCount: chunks.isEmpty ? 1 : chunks.count
        )

        // Write to temp file first (atomic replacement)
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("tarzi_imu_\(Int(Date().timeIntervalSince1970)).mp4")
        try output.write(to: tmpURL, options: .atomic)

        if let outPath = outputPath {
            // resumeEmbed path: write to outPath, never touch source
            let outURL = outPath.hasPrefix("file://")
                ? URL(string: outPath)!
                : URL(fileURLWithPath: outPath)
            try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(),
                                                      withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: outURL)
            try FileManager.default.moveItem(at: tmpURL, to: outURL)
            return (outPath, validationStatus)
        } else {
            // stopAndEmbed path: replace source
            try? FileManager.default.removeItem(at: sourceURL)
            try FileManager.default.moveItem(at: tmpURL, to: sourceURL)
            return (videoUri, validationStatus)
        }
    }

    // MARK: – Validation

    private func validateGpmfOutput(_ data: Data,
                                     accelCount: Int,
                                     gyroCount:  Int,
                                     chunkCount: Int) -> String {
        if accelCount == 0 && gyroCount == 0 { return "warning_no_sensor_data" }
        if accelCount == 0 || gyroCount == 0 { return "warning_partial_sensor_data" }

        let topAtoms = parseMp4Atoms(data)
        guard let moovAtom = topAtoms.first(where: { $0.type == "moov" }) else {
            return "error_no_moov"
        }
        let moovAtoms = parseMp4Atoms(moovAtom.payload)
        let gpmdFound = moovAtoms
            .filter { $0.type == "trak" }
            .contains { trak in trakHasGpmdEntry(trak.payload) }
        guard gpmdFound else { return "error_no_gpmd_track" }

        if chunkCount < 2 { return "warning_single_gpmd_sample" }

        return "ok"
    }

    private func trakHasGpmdEntry(_ trakPayload: Data) -> Bool {
        let trakAtoms = parseMp4Atoms(trakPayload)
        guard let mdiaAtom = trakAtoms.first(where: { $0.type == "mdia" }) else { return false }
        let mdiaAtoms = parseMp4Atoms(mdiaAtom.payload)

        guard let hdlrAtom = mdiaAtoms.first(where: { $0.type == "hdlr" }) else { return false }
        let hp = hdlrAtom.payload
        guard hp.count >= 12 else { return false }
        let htStart = hp.startIndex + 8
        let handlerType = String(bytes: hp[htStart ..< htStart + 4], encoding: .ascii) ?? ""
        guard handlerType == "meta" else { return false }

        guard let minfAtom = mdiaAtoms.first(where: { $0.type == "minf" }) else { return false }
        let minfAtoms = parseMp4Atoms(minfAtom.payload)
        guard let stblAtom = minfAtoms.first(where: { $0.type == "stbl" }) else { return false }
        let stblAtoms = parseMp4Atoms(stblAtom.payload)
        guard let stsdAtom = stblAtoms.first(where: { $0.type == "stsd" }) else { return false }
        guard stsdAtom.payload.count >= 8 else { return false }
        let entries = parseMp4Atoms(stsdAtom.payload.dropFirst(8))
        return entries.contains { $0.type == "gpmd" }
    }

    // MARK: – MP4 atom parser

    private struct Mp4Atom {
        let type: String
        let payload: Data
        let rawBytes: Data
    }

    private func parseMp4Atoms(_ data: Data) -> [Mp4Atom] {
        var atoms: [Mp4Atom] = []
        var offset = data.startIndex
        while offset < data.endIndex {
            guard offset + 8 <= data.endIndex else { break }
            let size32 = data[offset ..< offset + 4]
                .withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            let typeName = String(bytes: data[offset + 4 ..< offset + 8], encoding: .ascii) ?? "????"

            let headerSize: Int
            let totalSize:  Int

            if size32 == 1 {
                guard offset + 16 <= data.endIndex else { break }
                let size64 = data[offset + 8 ..< offset + 16]
                    .withUnsafeBytes { $0.load(as: UInt64.self).bigEndian }
                headerSize = 16; totalSize = Int(size64)
            } else if size32 == 0 {
                totalSize = data.distance(from: offset, to: data.endIndex); headerSize = 8
            } else {
                totalSize = Int(size32); headerSize = 8
            }

            guard totalSize >= headerSize, offset + totalSize <= data.endIndex else { break }
            let raw     = data[offset ..< offset + totalSize]
            let payload = data[offset + headerSize ..< offset + totalSize]
            atoms.append(Mp4Atom(type: typeName, payload: payload, rawBytes: Data(raw)))
            offset = offset + totalSize
        }
        return atoms
    }

    private func parseMvhd(_ payload: Data) -> (timescale: UInt32, duration: UInt32) {
        guard payload.count >= 4 else { return (1000, 0) }
        let version = payload[payload.startIndex]
        if version == 1 {
            guard payload.count >= 28 else { return (1000, 0) }
            let ts = payload[payload.startIndex + 20 ..< payload.startIndex + 24]
                .withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
            let dur64 = payload[payload.startIndex + 24 ..< payload.startIndex + 32]
                .withUnsafeBytes { $0.load(as: UInt64.self).bigEndian }
            return (ts, UInt32(min(dur64, UInt64(UInt32.max))))
        } else {
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
         UInt8((v >> 8)  & 0xFF), UInt8(v & 0xFF)]
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

    private func buildTkhd(trackId: UInt32, duration: UInt32) -> Data {
        var p: [UInt8] = []
        p += be32(0); p += be32(0); p += be32(trackId); p += be32(0); p += be32(duration)
        p += [UInt8](repeating: 0, count: 8)
        p += be16(0); p += be16(0); p += be16(0); p += be16(0)
        p += be32(0x00010000); p += be32(0); p += be32(0)
        p += be32(0); p += be32(0x00010000); p += be32(0)
        p += be32(0); p += be32(0); p += be32(0x40000000)
        p += be32(0); p += be32(0)
        return fullBox("tkhd", version: 0, flags: 3, payload: p)
    }

    private func buildMdhd(timescale: UInt32, duration: UInt32) -> Data {
        var p: [UInt8] = []
        p += be32(0); p += be32(0)
        p += be32(timescale); p += be32(duration)
        p += be16(0x55C4); p += be16(0)
        return fullBox("mdhd", payload: p)
    }

    private func buildHdlr(handlerType: String, name: String) -> Data {
        var p: [UInt8] = []
        p += be32(0)
        p += Array(handlerType.utf8.prefix(4))
        p += [UInt8](repeating: 0, count: 12)
        p += Array((name + "\0").utf8)
        return fullBox("hdlr", payload: p)
    }

    private func buildNmhd() -> Data { fullBox("nmhd", payload: []) }

    private func buildUrl() -> Data { fullBox("url ", flags: 1, payload: []) }

    private func buildDref() -> Data {
        var p = be32(1); p += Array(buildUrl()); return fullBox("dref", payload: p)
    }

    private func buildDinf() -> Data { mp4Box("dinf", payload: buildDref()) }

    private func buildGpmdEntry(dataRefIndex: UInt16 = 1) -> Data {
        var p: [UInt8] = [UInt8](repeating: 0, count: 6)
        p += be16(dataRefIndex)
        return mp4Box("gpmd", payload: p)
    }

    private func buildStsd() -> Data {
        var p = be32(1); p += Array(buildGpmdEntry())
        return fullBox("stsd", payload: p)
    }

    // stts: N chunks, each with sample delta = timescale (1 second in movie units).
    // Using one compact entry saves space when all deltas are equal.
    private func buildStts(chunkCount: UInt32, timescale: UInt32) -> Data {
        var p = be32(1)            // 1 stts entry
        p += be32(chunkCount)      // covers all N samples
        p += be32(timescale)       // each sample lasts 1 second in movie units
        return fullBox("stts", payload: p)
    }

    // stsc: every chunk contains exactly 1 sample
    private func buildStsc() -> Data {
        var p = be32(1); p += be32(1); p += be32(1); p += be32(1)
        return fullBox("stsc", payload: p)
    }

    // stsz: per-sample (per-chunk) sizes
    private func buildStsz(sizes: [UInt32]) -> Data {
        var p = be32(0)            // no uniform size
        p += be32(UInt32(sizes.count))
        for s in sizes { p += be32(s) }
        return fullBox("stsz", payload: p)
    }

    // stco: per-chunk absolute byte offsets in the file
    private func buildStco(offsets: [UInt32]) -> Data {
        var p = be32(UInt32(offsets.count))
        for o in offsets { p += be32(o) }
        return fullBox("stco", payload: p)
    }

    private func buildStbl(chunks: [(payload: Data, chunkOffset: UInt32)],
                            timescale: UInt32) -> Data {
        let sizes   = chunks.map { UInt32($0.payload.count) }
        let offsets = chunks.map { $0.chunkOffset }
        var inner = Data()
        inner.append(buildStsd())
        inner.append(buildStts(chunkCount: UInt32(chunks.count), timescale: timescale))
        inner.append(buildStsc())
        inner.append(buildStsz(sizes: sizes))
        inner.append(buildStco(offsets: offsets))
        return mp4Box("stbl", payload: inner)
    }

    private func buildMinf(chunks: [(payload: Data, chunkOffset: UInt32)],
                            timescale: UInt32) -> Data {
        var inner = Data()
        inner.append(buildNmhd())
        inner.append(buildDinf())
        inner.append(buildStbl(chunks: chunks, timescale: timescale))
        return mp4Box("minf", payload: inner)
    }

    private func buildMdia(timescale: UInt32,
                            duration:  UInt32,
                            chunks: [(payload: Data, chunkOffset: UInt32)]) -> Data {
        var inner = Data()
        inner.append(buildMdhd(timescale: timescale, duration: duration))
        inner.append(buildHdlr(handlerType: "meta", name: "GoPro TCD"))
        inner.append(buildMinf(chunks: chunks, timescale: timescale))
        return mp4Box("mdia", payload: inner)
    }

    private func buildGpmdTrak(trackId:   UInt32,
                                timescale: UInt32,
                                duration:  UInt32,
                                chunks: [(payload: Data, chunkOffset: UInt32)]) -> Data {
        var inner = Data()
        inner.append(buildTkhd(trackId: trackId, duration: duration))
        inner.append(buildMdia(timescale: timescale, duration: duration, chunks: chunks))
        return mp4Box("trak", payload: inner)
    }

    // MARK: – GPMF binary builder
    //
    // GPMF KLV layout (big-endian):
    //   [4B FourCC][1B type][1B el-size][2B repeat][data 4B-aligned]
    //
    // Containers: type=0x00, el-size=4, repeat=inner_len/4
    // 'c' string:  type=0x63, el-size=1,  repeat=strlen
    // 's' int16:   type=0x73, el-size=2,  repeat=1
    // 'L' uint32:  type=0x4C, el-size=4,  repeat=1
    // 'f' float32: type=0x66, el-size=12, repeat=N

    private func gpmfPad(_ d: Data) -> Data {
        let r = d.count % 4; guard r != 0 else { return d }
        return d + Data(repeating: 0, count: 4 - r)
    }

    private func gpmfHdr(fourCC: String, type: UInt8, elSize: UInt8, repeat rpt: UInt16) -> Data {
        var d = Data(Array(fourCC.utf8.prefix(4)))
        d.append(type); d.append(elSize)
        var r = rpt.bigEndian; withUnsafeBytes(of: &r) { d.append(contentsOf: $0) }
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
        var d = gpmfHdr(fourCC: fourCC, type: 0x63, elSize: 1, repeat: UInt16(bytes.count))
        d.append(gpmfPad(bytes))
        return d
    }

    private func gpmfInt16(_ fourCC: String, value: Int16) -> Data {
        var v = value.bigEndian; var pad: Int16 = 0
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

    private func gpmfFloat3d(_ fourCC: String, samples: [ImuSample]) -> Data {
        var d = gpmfHdr(fourCC: fourCC, type: 0x66, elSize: 12, repeat: UInt16(samples.count))
        for s in samples {
            var x = Float32(s.x).bitPattern.bigEndian
            var y = Float32(s.y).bitPattern.bigEndian
            var z = Float32(s.z).bitPattern.bigEndian
            withUnsafeBytes(of: &x) { d.append(contentsOf: $0) }
            withUnsafeBytes(of: &y) { d.append(contentsOf: $0) }
            withUnsafeBytes(of: &z) { d.append(contentsOf: $0) }
        }
        return d   // 12 × N is always 4-byte aligned
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

    private func buildGpmfPayload(accelList: [ImuSample], gyroList: [ImuSample]) -> Data {
        var inner = Data()
        inner.append(gpmfString("DVNM", "Tarzi Mobile"))
        inner.append(buildAccelStream(accelList))
        inner.append(buildGyroStream(gyroList))
        return gpmfContainer("DEVC", inner: inner)
    }
}
