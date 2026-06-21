---
name: Disabled-user access control
description: How disabled-user enforcement works across backend, mobile, and admin — key integration points and gotchas.
---

## Rule
When a mobile user account has `status = 'disabled'`, every API request returns HTTP 403 with `{ statusCode: 403, code: 'USER_ACCOUNT_DISABLED', message: 'Your account is disabled.' }`.

**Why:** The JWT strategy validates the DB status on every authenticated request. The exception filter was extended to pass through the `code` field from HttpException responses.

## How to apply

### Backend
- `JwtStrategy.validate()` — if `payload.type === 'user'`, looks up `user.status` in DB; throws HttpException 403 with `code: 'USER_ACCOUNT_DISABLED'` if `status === 'disabled'`.
- `AuthService.requestOtp` and `verifyOtp` — also throw the same 403 so disabled users can't get new tokens.
- `GlobalExceptionFilter` — modified to spread any `code` string from the HttpException response body into the JSON response. Do NOT remove this or mobile detection will break.
- Admin endpoint: `PATCH /api/users/:id/status` with AdminJwtGuard. Uses `UsersService.updateStatus()` which logs to audit as `user.status_changed`.

### Mobile
- `AuthContext.tsx` exports `_notifyDisabled()` (module-level bridge) and `isDisabledError()` helper.
- `_layout.tsx` creates `QueryClient` with `QueryCache.onError` + `MutationCache.onError` that call `_notifyDisabled()` on any 403+USER_ACCOUNT_DISABLED error.
- `RootLayoutNav` checks `isDisabled` from `useAuth()` and renders `DisabledAccountView` as a full-screen gate (no navigation possible, only Logout button).

### Admin Dashboard
- `users.tsx` uses `useUpdateUserStatus` hook (generated from operationId `updateUserStatus`).
- Disable button turns red, Enable button turns green; both open an `AlertDialog` confirmation.
