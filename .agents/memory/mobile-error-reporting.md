---
name: Mobile error reporting
description: How mobile error capture, offline queuing, and drain-on-startup work in the Expo app
---

## Rule
`lib/errorReporting.ts` is the single source of truth for all mobile error capture. It queues to AsyncStorage when offline and drains on next startup.

**Why:** Real-device upload failures were silent — no visibility into what was failing. The queue handles airplane-mode or brief network drops without losing error context.

**How to apply:**
- Import `reportError` in any mobile flow that can fail (API calls, file ops, media capture).
- Import `reportRenderError` and pass it as `onError` prop to `ErrorBoundary` in `_layout.tsx`.
- Call `drainErrorQueue()` in the app-ready effect in `_layout.tsx`.
- `reportError` takes `{ errorType, message, endpoint?, httpMethod?, httpStatus?, collectionType?, metadata? }`.
- The queue key is `@capto/errorQueue` in AsyncStorage. Drain attempts silently swallow their own errors to avoid recursive loops.
- `expo-constants` and `@react-native-community/netinfo` are both already in `artifacts/mobile/package.json` — no install needed.
