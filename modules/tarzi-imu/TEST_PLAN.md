# TarziImu — Real-Device Embedding Test Plan

## Background

`stopAndEmbed()` muxes raw GPMF binary data (accelerometer + gyroscope) into the
recorded MP4 file at the native layer.  This path involves platform-specific byte
manipulation (iOS) and `MediaMuxer`/`MediaExtractor` APIs (Android) that cannot be
meaningfully tested in the Expo Go simulator.  This plan covers the end-to-end
validation steps required on a real iOS and Android device.

---

## Pre-conditions

| Requirement | Detail |
|---|---|
| Build type | EAS Development Build (not Expo Go) |
| Task config | A task with **`recordImu: true`** and **`imuRequired: true`** |
| Admin seed | Use `admin@capto.app` / `Admin@1234` in dev; create/find a task with IMU enabled |
| Tools (PC) | `mp4info` (from [Bento4](https://www.bento4.com/)) or the Python GPMF parser at `modules/tarzi-imu/scripts/check_gpmf.py` |
| Platforms | One iOS 16+ device, one Android 10+ device |

---

## Step-by-step Manual Test

### 1 — Record a short IMU video

1. Install the dev build on the test device.
2. Log in with a field-agent account.
3. Navigate to the task with `recordImu: true`.
4. Tap the video collection type and land on the Video Capture screen.
5. Confirm the UI does **not** show the "Motion Sensors Required" blocked state.
6. Record a **10–15 second clip** and stop.
7. Watch for the **"Preparing motion data…"** overlay — it must appear briefly after
   stopping and then disappear before the Review screen loads.
8. Proceed through Review and submit the draft.

**Pass criteria (on-device):**
- No error alert saying "Motion data could not be added to this video."
- The overlay appears and dismisses cleanly.
- Submission succeeds (no "Please retake the video" error).

---

### 2 — Verify `ImuCaptureSummary` in the submitted payload

On the admin dashboard, open the submission just created:

- `imuEmbedded` must be `true`
- `accelerometerSampleCount` must be ≥ 50 (≈5 s × 100 Hz minimum)
- `gyroscopeSampleCount` must be ≥ 50
- `imuValidationStatus` must be **`"ok"`**
- `imuFormat` must be `"GPMF"` (uppercase, as returned by native)

**Failure indicators to watch for:**
- `imuValidationStatus: "warning_no_sensor_data"` → sensor updates never arrived;
  check background-thread timing and `motionQueue.waitUntilAllOperationsAreFinished()`
  on iOS or `CopyOnWriteArrayList` thread-safety on Android.
- `imuValidationStatus: "error_*"` → GPMF track was not found in the output MP4;
  see §4 for offline analysis.
- `imuEmbedded: false` → native module not loaded (wrong build type).

---

### 3 — Multi-segment (pause/resume) test

1. Start recording.
2. Tap **Pause** after ~5 s — confirm the overlay appears and dismisses.
3. Tap **Resume** and record another ~5 s.
4. Stop.
5. Verify each segment passes the checks from §2.
6. Confirm the `ImuCaptureSummary` reflects the **total** sample count across both
   segments (it is the sum of per-segment metadata).

---

### 4 — Offline MP4 inspection (GPMF track verification)

After submitting, export the MP4 from the device (via Finder/ADB) and run one of
the following checks on a computer.

#### Option A — `mp4info` (Bento4)

```sh
mp4info path/to/recording.mp4
```

Expected output (excerpt):

```
Track 3:
  type:         Metadata
  duration:     …
  Sample Description 0
    Coding:     gpmd
```

A track of type `Metadata` with coding `gpmd` (iOS) or MIME `application/gpmd`
(Android; appears as a metadata track) must be present.

#### Option B — Python GPMF parser

```sh
python3 modules/tarzi-imu/scripts/check_gpmf.py path/to/recording.mp4
```

The script (see `modules/tarzi-imu/scripts/check_gpmf.py`) extracts the `gpmd`
track, parses the GPMF KLV stream, and prints a summary:

```
DEVC found
  DVNM: Tarzi Mobile
  STRM (Accelerometer): 1500 samples @ 100.0 Hz
  STRM (Gyroscope):     1492 samples @ 99.5 Hz
✓ GPMF track is valid
```

#### Option C — `ffprobe`

```sh
ffprobe -v error -show_streams -select_streams d path/to/recording.mp4
```

Look for a stream with `codec_tag_string=gpmd` or `codec_name=bin_data`.

---

## Known Failure Modes and Mitigations

| Symptom | Likely cause | Mitigation |
|---|---|---|
| `imuValidationStatus: "error_11"` (iOS) | GPMF `gpmd` track not found in output; byte-level mux bug | Inspect with §4 tools; file a native bug with the raw bytes |
| `imuValidationStatus: "error_no_gpmd_track"` (Android) | `MediaMuxer` dropped the `application/gpmd` track | Try Android 12+; check `MediaMuxer` version support |
| `imuValidationStatus: "error_empty_gpmd_sample"` (Android) | GPMF payload was written but MediaExtractor reads it as empty | Check GPMF payload builder output size |
| `imuValidationStatus: "warning_no_sensor_data"` | Sensors stopped before `stopAndEmbed` was called; race condition | Ensure `imuStartCapture` resolves before `recordAsync` starts |
| Submission blocked with "Please retake the video" | `imuValidationStatus !== "ok"` guard in `submitDraft.ts` | Fix native module to return `"ok"` on success (done) |
| Overlay never appears | `setImuProcessing(true)` path not reached | Confirm `isFinalStop === true` in `recordSegment()` |
| Overlay hangs indefinitely | `stopAndEmbed` promise never resolves | Add a 30 s timeout wrapper around the native call |

---

## Regression Checklist (run after any native change)

- [ ] iOS: 10 s single-segment clip → `imuValidationStatus === "ok"`, samples ≥ 50
- [ ] iOS: Pause/resume (2 segments) → combined samples match total duration
- [ ] Android: 10 s single-segment clip → `imuValidationStatus === "ok"`, samples ≥ 50
- [ ] Android: Pause/resume (2 segments) → combined samples match total duration
- [ ] `mp4info` / Python script confirms `gpmd` track present on both platforms
- [ ] Task with `imuRequired: true` submits without error
- [ ] Task with `imuRequired: false` + sensor unavailable → user sees dialog, can continue
- [ ] App-backgrounded during recording → recording discards cleanly, no crash

---

## Files Changed in this Task

- `modules/tarzi-imu/ios/TarziImuModule.swift` — `validationStatus = "valid"` → `"ok"`
- `modules/tarzi-imu/android/src/main/java/expo/modules/tarziImu/TarziImuModule.kt` — `"valid"` → `"ok"` in `validateGpmdTrack`

**Why this matters:** `submitDraft.ts` blocks submission when
`imuValidationStatus !== "ok"`.  Before this fix, every successful IMU capture
returned `"valid"`, causing all `imuRequired` tasks to be permanently unsubmittable.
