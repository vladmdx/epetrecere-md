#!/bin/sh
# Vercel ignoreCommand — skip builds when nothing under the web's
# source paths has changed. Exit codes per Vercel docs:
#   0  → skip build (no deployment)
#   1  → proceed with build
#
# We skip when the changes since the last deployed commit touch ONLY
# mobile-only paths (packages/mobile/, packages/shared/) or other paths we
# know don't affect the Next.js build. This cuts down on:
#   - Preview deploys for mobile-only branches that would otherwise
#     fail because Preview env doesn't have DATABASE_URL etc.
#   - Wasted Vercel build minutes on commits that change nothing
#     the web consumes (README, docs, mobile screens).
#
# IMPORTANT — why this looks at a RANGE and not just HEAD^1..HEAD:
# it used to compare the tip commit against its parent alone. Vercel builds
# only the tip of a push, so a push containing a web commit followed by a
# docs or mobile commit was judged entirely on that last commit: the gate
# said "mobile-only", cancelled the build, and the web changes never shipped.
# Nothing failed — the deployment reported Canceled and the old API kept
# serving, so new endpoints simply 404'd with no error anywhere. That is the
# worst shape a deploy gate can have, so the rule now is: skip only when
# EVERY commit since the last deployed one is skippable, and when in any
# doubt about the range, build.

set -e

# No parent → first commit or shallow clone with no history → build
if ! git rev-parse HEAD^1 >/dev/null 2>&1; then
  echo "[vercel-ignore] no parent commit — building"
  exit 1
fi

# Prefer the commit Vercel last deployed, when it tells us and we have it.
BASE=""
if [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && \
   git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  BASE="$VERCEL_GIT_PREVIOUS_SHA"
  echo "[vercel-ignore] base = last deployed commit ${BASE}"
else
  # Otherwise walk back as far as the clone allows, up to 20 commits, and
  # judge the whole window. Over-building costs build minutes; under-building
  # ships an app that calls endpoints which are not there.
  N=20
  while [ "$N" -gt 0 ]; do
    if git rev-parse "HEAD~$N" >/dev/null 2>&1; then
      BASE="HEAD~$N"
      break
    fi
    N=$((N - 1))
  done
  if [ -z "$BASE" ]; then
    echo "[vercel-ignore] no usable base in a shallow clone — building"
    exit 1
  fi
  echo "[vercel-ignore] base = $BASE (no previous-deploy sha available)"
fi

CHANGED=$(git diff --name-only "$BASE" HEAD || true)
if [ -z "$CHANGED" ]; then
  # Empty diff (rare — Vercel still rebuilds via SDK trigger) — build.
  echo "[vercel-ignore] empty diff — building"
  exit 1
fi

# Filter out paths we know don't impact the web build. If anything
# remains, we have a real web change → build.
NON_WEB=$(echo "$CHANGED" | grep -vE "^(packages/mobile/|packages/shared/|\.github/|README\.md|AGENTS\.md|CLAUDE\.md|DASHBOARD-TEST-REPORT\.md|scripts/seed-test-)" || true)

if [ -z "$NON_WEB" ]; then
  echo "[vercel-ignore] mobile-only range — skipping web build"
  exit 0
fi

echo "[vercel-ignore] web changes detected — building"
echo "$NON_WEB" | head -5
exit 1
