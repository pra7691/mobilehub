---
name: Orval zod schemas collision
description: How to prevent TS2308 duplicate export errors from Orval's zod codegen
---

## Rule
Remove `schemas: { path: "generated/types", type: "typescript" }` from the `zod` output block in `lib/api-spec/orval.config.ts`. Also ensure `lib/api-zod/src/index.ts` only has `export * from "./generated/api"` and nothing else.

**Why:** When `schemas` is set, Orval generates separate TypeScript type declarations in `generated/types/` AND Zod schema values in `generated/api.ts`, both exporting the same names (e.g. `AdminApproveSubmissionBody`). Re-exporting both from `index.ts` causes TS2308. The types from `api-client-react` are sufficient; `api-zod` consumers only need the runtime Zod schemas.

**How to apply:** After any codegen run that adds new request body schemas, if TS2308 appears, check that (1) `schemas` option is absent from `orval.config.ts` zod block, and (2) `lib/api-zod/src/index.ts` has not been manually modified to re-add the types barrel. Orval does NOT regenerate the workspace-root `index.ts` — only the `generated/` subfolder is cleaned/rebuilt.
