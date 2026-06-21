---
name: MobileErrorLog NestJS module
description: Backend module, Prisma model, and OpenAPI paths for capturing and reviewing mobile errors
---

## Rule
`MobileErrorLog` is a standalone NestJS module at `artifacts/api-server/src/mobile-error-logs/`. It has two controllers: one mobile-authed POST endpoint and one admin-authed set of GET/PATCH endpoints.

**Why:** Needed to diagnose real-device submission failures that were previously invisible. Supports offline-queued error draining from mobile.

**How to apply:**
- Mobile POST: `POST /api/mobile-error-logs` — authenticated with `JwtAuthGuard`, userId extracted from JWT.
- Admin endpoints: `GET/GET/:id/PATCH/:id/resolve/PATCH/:id/unresolve` under `/api/admin/mobile-error-logs` — authenticated with `AdminJwtGuard`.
- Prisma `User` model has a `mobileErrorLogs MobileErrorLog[]` reverse relation (required for Prisma schema validation).
- OpenAPI spec paths and schemas were added to `lib/api-spec/openapi.yaml`; Orval codegen generates `useAdminListMobileErrorLogs`, `useAdminResolveMobileErrorLog`, `useAdminUnresolveMobileErrorLog` hooks.
- Admin UI page at `artifacts/admin-dashboard/src/pages/error-logs.tsx`, registered at `/error-logs` in `App.tsx`, sidebar item added in `layout.tsx`.
