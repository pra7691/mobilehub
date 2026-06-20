---
name: NestJS security setup
description: Production security configuration for the Capto NestJS API
---

## main.ts bootstrap order
1. `app.use(helmet())` — security headers
2. Request ID middleware — propagates x-request-id through req object (cast via `req as unknown as Record<string,unknown>`)
3. enableCors with `ALLOWED_ORIGINS` env var (comma-separated; defaults to true in dev)
4. setGlobalPrefix('api')
5. ValidationPipe (whitelist + forbidNonWhitelisted)
6. GlobalExceptionFilter

## Rate limiting
- ThrottlerModule in AppModule: global 100 req/60s
- Auth routes use `@Throttle({ default: { limit: N, ttl: 60000 } })` per-route overrides
- 5/min for admin login, 3/min for request-OTP, 10/min for verify-OTP

## AuditModule
- Decorated `@Global()` — exports AuditService to all modules without re-importing
- Must be listed in AppModule imports before modules that use AuditService

## TypeScript gotchas
- `@types/express` must be added as devDependency to api-server (`pnpm --filter @workspace/api-server add -D @types/express`)
- Casting express Request to custom props: `(req as unknown as Record<string,unknown>)['key']` (not just `as Record<string,unknown>`)
- Prisma Json fields: cast metadata as `Prisma.InputJsonValue`

**Why:** These quirks caused typecheck failures during the hardening pass and took multiple attempts to resolve.
