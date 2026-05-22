#!/bin/sh
# Vercel ignoreCommand — skip builds when nothing under the web's
# source paths has changed. Exit codes per Vercel docs:
#   0  → skip build (no deployment)
#   1  → proceed with build
#
# We skip when the diff between this commit and its first parent
# touches ONLY mobile-only paths (packages/mobile/, packages/shared/)
# or other paths we know don't affect the Next.js build. This cuts
# down on:
#   - Preview deploys for mobile-only branches that would otherwise
#     fail because Preview env doesn't have DATABASE_URL etc.
#   - Wasted Vercel build minutes on commits that change nothing
#     the web consumes (README, docs, mobile screens).
#
# Fallback: if we can't compute a diff (orphan first commit, shallow
# clone with no parent, merge with multiple parents), build defensively.

set -e

# No parent → first commit or shallow clone with no history → build
if ! git rev-parse HEAD^1 >/dev/null 2>&1; then
  echo "[vercel-ignore] no parent commit — building"
  exit 1
fi

CHANGED=$(git diff --name-only HEAD^1 HEAD || true)
if [ -z "$CHANGED" ]; then
  # Empty diff (rare — Vercel still rebuilds via SDK trigger) — build.
  echo "[vercel-ignore] empty diff — building"
  exit 1
fi

# Filter out paths we know don't impact the web build. If anything
# remains, we have a real web change → build.
NON_WEB=$(echo "$CHANGED" | grep -vE "^(packages/mobile/|packages/shared/|\.github/|README\.md|AGENTS\.md|CLAUDE\.md|DASHBOARD-TEST-REPORT\.md|scripts/seed-test-)" || true)

if [ -z "$NON_WEB" ]; then
  echo "[vercel-ignore] mobile-only commit — skipping web build"
  exit 0
fi

echo "[vercel-ignore] web changes detected — building"
echo "$NON_WEB" | head -5
exit 1
