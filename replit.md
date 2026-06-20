# Capto

Mobile data-collection platform where field agents complete tasks via a mobile app, with an admin dashboard for oversight and a NestJS backend API.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the NestJS API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/admin-dashboard run dev` — run admin dashboard (served at `/`)
- `pnpm --filter @workspace/mobile run dev` — run Expo mobile app (served at `/mobile`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: NestJS 11 + Prisma + PostgreSQL
- Admin Dashboard: React Vite + shadcn/ui + Recharts (dark/cyan theme)
- Mobile: Expo 54 + React Native (dark/cyan theme, JWT auth)
- Auth: JWT (access + refresh tokens), OTP-based login for mobile users
- Validation: class-validator (server), Zod (client)
- API codegen: Orval (from OpenAPI spec → `lib/api-client-react`)

## Where things live

- `artifacts/api-server/` — NestJS backend, Prisma schema at `prisma/schema.prisma`
- `artifacts/api-server/prisma/seed.ts` — DB seed (admin user, OTP settings)
- `artifacts/admin-dashboard/src/` — React Vite admin UI
- `artifacts/mobile/` — Expo mobile app, screens in `app/`
- `lib/api-client-react/src/generated/` — Orval-generated API hooks (do not edit manually)
- `lib/api-spec/` — OpenAPI spec source of truth

## Architecture decisions

- Contract-first: OpenAPI spec drives all client API hooks via Orval codegen
- NestJS with Prisma (not Express + Drizzle) — chosen for the module/decorator pattern that scales cleanly with 10+ domain modules
- JWT strategy with short-lived access tokens + refresh tokens stored in SecureStore on mobile
- Test OTP mode enabled by default (OTP = `123456`) — disable in prod via admin OTP settings page
- Metro config uses `disableHierarchicalLookup + nodeModulesPaths` to resolve pnpm workspace packages correctly

## Product

- **Mobile users**: Request OTP, verify, browse tasks, view task details, submit photo evidence
- **Admin**: Manage users, categories, subcategories, tasks, review submissions, approve/reject (with wallet credit), configure OTP settings, view dashboard charts

## Default credentials (dev seed)

- Admin: `admin@capto.app` / `Admin@1234`
- Test OTP: `123456` (test mode on by default)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- NestJS build command is `tsc -p tsconfig.json` (not esbuild). Dev command: `export NODE_ENV=development && pnpm run build && pnpm run start`
- Old Express stub files (`src/app.ts`, `src/index.ts`, etc.) still exist with empty exports — do NOT delete them, tsconfig includes them
- Prisma client must be generated before running (`prisma generate` runs automatically via postinstall)
- pnpm-workspace.yaml must allowNonAppliedRoot for Prisma and NestJS build scripts
- DTOs use `!` assertion on class properties (required for strict TS + class-validator pattern)
- Metro config watches the workspace root so pnpm-linked packages resolve correctly

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
