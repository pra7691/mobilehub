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

## Mid-Session IMU Embed Timeout

### Background

When `imuStopAndEmbed()` exceeds the configured embed timeout on a **non-final pause**
(i.e. the user paused but has not yet stopped), `recordSegment()` catches the
`"IMU_EMBED_TIMEOUT"` error, keeps the raw segment URI in `segmentsRef`, and sets
`imuWarning` to show a dismissible amber banner:

> *"Motion data timed out for one segment. Recording continues."*

The recording screen must remain fully interactive: the user can dismiss the banner,
resume recording, add more segments, and eventually stop and submit.  This section
provides a repeatable way to trigger that path on a real device without needing to
mock the native module.

---

### 5 — Mid-session IMU embed timeout (paused segment) + successful submission

This test is split into two deterministic phases.  **Phase A** forces a timeout on
the first pause so the warning banner is reliably observed.  **Phase B** restores
the timeout before the final stop so the session always proceeds to Review and the
submission path is always exercised.  This makes every pass criterion unconditional.

#### Pre-conditions

Same as §3, **plus**: you need admin access to adjust the embed timeout via the
admin dashboard.

---

#### Phase A — Trigger the mid-session timeout

**Setup (once):**

1. Open the admin dashboard → **Settings** → **Capture**.
2. Set **IMU Embed Timeout** to **1** second (minimum allowed) and save.
3. Kill and relaunch the mobile app so `useGetAppSettings` fetches the new value.
   The capture screen reads `appSettings?.capture?.imuEmbedTimeoutMs` on every
   `recordSegment()` call, so a fresh fetch is sufficient — no rebuild required.

> **Why 1 s works:** `stopAndEmbed()` performs native MP4 muxing.  On a real device
> this typically takes 1–4 s per segment, so a 1 000 ms cap reliably races past
> the native call on the first pause.

**Steps:**

1. Install the dev build; log in as a field agent.
2. Navigate to a task with `recordImu: true`.
3. Tap the video collection type to open the Video Capture screen.
4. Confirm the UI shows no blocked/error state and the record button is enabled.
5. Tap **Record** and let it run for **8–10 s**.
6. Tap **Pause**.
   - `imuStopAndEmbed()` runs; the 1 s `Promise.race` rejection fires first.

**Pass criteria after step 6 (all required):**

- The amber warning banner appears at the top of the screen:
  *"Motion data timed out for one segment. Recording continues."*
- The **Pause / Resume** and **Stop** buttons are still visible and tappable.
- The recording timer is frozen at the paused value (correct).
- No error modal or navigation away from the screen.
- The app is **not** frozen — tapping the dismiss ✕ on the banner removes it.

7. Tap the **✕** on the banner to dismiss it.  Confirm it disappears.
8. Confirm all recording controls remain tappable (do **not** stop yet).

---

#### Phase B — Restore timeout, complete recording, and verify submission

**Before stopping,** restore the timeout so the final `imuStopAndEmbed()` has
enough time to succeed:

9. Switch to the admin dashboard tab (keep the recording app paused on the device).
10. Set **IMU Embed Timeout** back to **30** seconds and save.
11. Return to the mobile app.  The timeout will be re-read from `appSettings`
    on the next `recordSegment()` call — no relaunch needed.

**Continue recording:**

12. Tap **Resume** on the mobile app.  Confirm the timer resumes and the camera
    resumes — a new segment begins recording.
13. Record for another **8–10 s** and tap **Stop**.
    - The final stop now runs with the 30 s timeout, giving the native mux
      sufficient time to complete.
    - Expected: the **"Preparing motion data…"** processing overlay appears
      briefly, then the **Review** screen loads.

**Pass criteria after step 13 (all required):**

- The Review screen loads without error.
- The video plays back and covers both segments.
- Proceed through Review and submit the draft.
- Submission succeeds (HTTP 200); the submission is visible in the admin dashboard.

**Pass criteria on the admin dashboard (all required):**

- The submission record exists and is not stuck.
- The **first segment** (the one that timed out in Phase A) shows `imuEmbedded: false`
  and uses the raw segment URI — this confirms the fallback preservation path works.
- The **second segment** (recorded under the restored 30 s timeout) shows
  `imuEmbedded: true` with `imuValidationStatus === "ok"`.
- `imuCaptureSummary.accelerometerSampleCount` and `gyroscopeSampleCount` reflect
  the second segment only (since the first timed out and has no embedded metadata).

---

### 6 — Verify recording controls remain interactive during and after warning

This micro-check can be performed immediately after step 6 above (banner visible).

| Action | Expected outcome |
|---|---|
| Tap **✕** on the warning banner | Banner disappears, no other state change |
| Tap **Resume** (banner already dismissed) | Timer resumes, camera resumes, no crash |
| Tap **Pause** again on the second segment | Second segment records, another timeout likely fires a second banner |
| Tap **Stop** | Final-stop path runs; either error message or Review screen appears |
| Device rotation during warning | Banner reflows correctly; recording state preserved |

All of the above must complete without the app freezing, crashing, or navigating
away unexpectedly.

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
- [ ] Mid-session timeout (§5): warning banner appears on non-final pause, controls stay responsive
- [ ] Mid-session timeout (§5): session can be continued and stopped after the warning
- [ ] Mid-session timeout (§5): submission succeeds after restoring timeout — timed-out segment uses raw URI, second segment shows imuEmbedded true

---

## Files Changed in this Task

- `modules/tarzi-imu/ios/TarziImuModule.swift` — `validationStatus = "valid"` → `"ok"`
- `modules/tarzi-imu/android/src/main/java/expo/modules/tarziImu/TarziImuModule.kt` — `"valid"` → `"ok"` in `validateGpmdTrack`

**Why this matters:** `submitDraft.ts` blocks submission when
`imuValidationStatus !== "ok"`.  Before this fix, every successful IMU capture
returned `"valid"`, causing all `imuRequired` tasks to be permanently unsubmittable.
