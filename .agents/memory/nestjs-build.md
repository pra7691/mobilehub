---
name: NestJS build setup
description: How the NestJS api-server is built and run in this project
---

Build command: `tsc -p tsconfig.json` (outputs CommonJS to `dist/`)
Start command: `node dist/main.js`
Dev workflow: `export NODE_ENV=development && pnpm run build && pnpm run start`

**Why:** NestJS decorators and metadata reflection require CommonJS and emitDecoratorMetadata. The project does not use esbuild for the api-server (only for the old Express scaffold).

Old Express stub files (`src/app.ts`, `src/index.ts`, `src/routes/index.ts`, `src/routes/health.ts`, `src/lib/logger.ts`) were left in place with empty exports — do NOT delete them; the tsconfig includes them.

The tsconfig must include:
- `"experimentalDecorators": true`
- `"emitDecoratorMetadata": true`
- `"module": "commonjs"`
