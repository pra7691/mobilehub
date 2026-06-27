---
name: Storage Module Architecture
description: Multi-provider storage abstraction — key decisions, gotchas, and Prisma relation names for StorageProfile.
---

## Structure
- `StorageProfile` Prisma model: relation to `SubmissionMedia` is named **`media`** (not `SubmissionMedia`) — use `_count: { select: { media: true } }` for counts.
- `StorageProviderType` enum values: `REPLIT | AWS_S3 | CLOUDFLARE_R2 | DO_SPACES`
- `EncryptionService`: requires `STORAGE_ENCRYPTION_KEY` env = 64 hex chars; falls back to dev key with WARN log.

## Activation rule
Activation requires `lastTestResult === 'ok'` — test must pass before activate endpoint works.

## Backward compatibility
`SubmissionMedia.storageProfileId` is nullable. Null → falls back to `ReplitStorageProvider` (objectStorage.ts sidecar). Non-null → routes through the loaded profile.

## S3 quirk
`forcePathStyle` is `true` only for `CLOUDFLARE_R2` (R2 doesn't support virtual-hosted style).

**Why:** Cloudflare R2 requires path-style bucket URLs; AWS S3 and DO Spaces use virtual-hosted by default.

## Metro blockList
After installing `@aws-sdk/client-s3` in the monorepo, Metro crashes watching `@smithy/core_tmp_NNNNN/dist-cjs` (ephemeral build dirs). Fixed with:
```js
config.resolver.blockList = [/node_modules\/\.pnpm\/.*_tmp_[0-9]+\/.*/];
```

## ProfileResponse `mediaCount`
`maskProfile()` accepts `StorageProfile & { _count?: { media?: number } }` — must include `{ _count: { select: { media: true } } }` in every `findMany`/`findUnique` that feeds `maskProfile`.
