---
name: Auth token strategy
description: How refresh tokens and admin session invalidation work in Capto API
---

## User refresh tokens
- Stored hashed (SHA-256) in `RefreshToken` DB model, not just signed JWTs
- On refresh: old token revoked (isRevoked=true), new pair issued and stored
- On logout: token marked revoked in DB via `revokeUserRefreshToken()`
- Expired rows cleaned up non-blockingly on each new token issue

## Admin session invalidation
- `AdminUser.tokenVersion Int @default(0)` — incremented on logout-all
- JWT payload includes `tv: admin.tokenVersion`; guard checks it matches DB on refresh
- `POST /auth/admin/logout-all` increments tokenVersion, invalidating all existing tokens

**Why:** Stateless JWTs alone can't be revoked before expiry. User refresh tokens need DB-backed revocation; admin logout-all is cheaper via version counter than storing all tokens.

**How to apply:** Any new token issuance for users must call `issueUserTokens()` which stores the hash. Admin JWTs must include `tv` in payload.
