#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server exec prisma db push --accept-data-loss
