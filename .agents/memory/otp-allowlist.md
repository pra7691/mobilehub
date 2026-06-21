---
name: OTP allowlist security
description: OTP test mode requires an explicit phone allowlist — empty list disables test OTP for all phones
---

# OTP Allowlist Security

## Rule
Test OTP works ONLY if: isTestMode=true AND testOtp is set AND the requesting phone is in allowedPhoneNumbers.

## Why
Original implementation used test OTP for ALL phones in test mode — any phone could bypass real SMS. This is a production security issue since it would allow arbitrary phone logins with one hard-coded code.

## How to apply
- `allowedPhoneNumbers` is a comma-or-newline-separated list of E.164 numbers stored on OtpSetting
- If the list is empty, `isPhoneOnAllowlist` is false → test OTP is never used
- Admin sets the allowlist via Admin → OTP Settings → Reviewer Phone Allowlist (Textarea field)
- OTP controller is guarded by AdminJwtGuard (not JwtAuthGuard) — was previously using the mobile user guard (security bug, now fixed)
- Before general rollout: disable test mode in Admin → OTP Settings
