#!/usr/bin/env bash
# Release script — creates a date-based version tag matching OpenACP format
# Version format: YYYY.MMDD.N (e.g., 2026.0401.1)
#
# Usage:
#   ./scripts/release.sh          # Auto-increment build number
#   ./scripts/release.sh --dry    # Show what would be tagged

set -euo pipefail

YEAR=$(date +%Y)
MMDD=$(date +%m%d)
PREFIX="v${YEAR}.${MMDD}"

# Find existing tags for today
EXISTING=$(git tag -l "${PREFIX}.*" 2>/dev/null | sort -t. -k3 -n | tail -1)

if [ -z "$EXISTING" ]; then
  BUILD=1
else
  LAST_BUILD=$(echo "$EXISTING" | sed "s/${PREFIX}\.//")
  BUILD=$((LAST_BUILD + 1))
fi

VERSION="${YEAR}.${MMDD}.${BUILD}"
TAG="v${VERSION}"

if [ "${1:-}" = "--dry" ]; then
  echo "Would create tag: ${TAG}"
  echo "Version: ${VERSION}"
  exit 0
fi

echo "Creating release ${TAG}..."

# Tag and push
git tag -a "${TAG}" -m "Release ${VERSION}"
git push origin "${TAG}"

echo "Tagged ${TAG} — GitHub Actions will build and release."
