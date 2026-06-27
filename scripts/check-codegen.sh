#!/usr/bin/env bash
# check-codegen.sh — verify that generated API types match the OpenAPI spec.
# Runs Orval codegen, diffs the output against what was on disk before, then
# restores the originals so the working tree is never mutated.
# Exits 1 if any generated file is stale or missing; 0 if everything is current.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GENERATED_DIRS=(
  "lib/api-client-react/src/generated"
  "lib/api-zod/src/generated"
)

BACKUP_DIR="$(mktemp -d)"

restore() {
  for dir in "${GENERATED_DIRS[@]}"; do
    local backup="$BACKUP_DIR/$dir"
    if [ -d "$backup" ]; then
      rm -rf "$dir"
      mkdir -p "$(dirname "$dir")"
      cp -r "$backup" "$dir"
    fi
  done
  rm -rf "$BACKUP_DIR"
}
trap restore EXIT

# Back up the current generated files, mirroring full relative paths under
# BACKUP_DIR to avoid basename collisions (all dirs are named "generated").
for dir in "${GENERATED_DIRS[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$dir")"
  cp -r "$dir" "$BACKUP_DIR/$(dirname "$dir")/"
done

# Run Orval (skip the typecheck:libs rebuild — we only want the diff).
pnpm --filter @workspace/api-spec exec orval --config ./orval.config.ts

# Compare backup (pre-codegen) against working tree (post-codegen).
# We diff the backup copy against the newly-generated files; any difference
# means the committed output was stale.
DIFF_OUTPUT=""
for dir in "${GENERATED_DIRS[@]}"; do
  backup="$BACKUP_DIR/$dir"
  result=$(diff -rq "$backup" "$dir" 2>&1 || true)
  if [ -n "$result" ]; then
    DIFF_OUTPUT+="$result"$'\n'
  fi
done

if [ -n "$DIFF_OUTPUT" ]; then
  echo "" >&2
  echo "┌─────────────────────────────────────────────────────────────┐" >&2
  echo "│  ERROR: Generated API types are stale                       │" >&2
  echo "└─────────────────────────────────────────────────────────────┘" >&2
  echo "" >&2
  echo "$DIFF_OUTPUT" >&2
  echo "Fix: pnpm --filter @workspace/api-spec run codegen" >&2
  echo "" >&2
  exit 1
fi

echo "OK: Generated API types are up to date."
