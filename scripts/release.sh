#!/usr/bin/env bash
# Release script — creates a date-based version tag
# Version format: YYYY.MDD.N (e.g., 2026.403.1) — semver-compatible, no leading zeros
#
# Usage:
#   ./scripts/release.sh              # Auto-increment build number
#   ./scripts/release.sh --dry        # Show what would be tagged
#   ./scripts/release.sh 2026.403.1   # Explicit version

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Current version ──
CURRENT=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}${CURRENT}${NC}"

# ── Calculate next version (YYYY.MDD.N) ──
# MDD = month + 2-digit day (no leading zero on month). Apr 3 = 403, Dec 31 = 1231
YEAR=$(date +%Y)
MONTH=$(date +"%-m")
DAY=$(date +"%d")
TODAY_PREFIX="${YEAR}.${MONTH}${DAY}"

if [[ -n "${1:-}" && "$1" != "--dry" ]]; then
  NEXT="$1"
else
  # Find highest existing patch for today's prefix
  PATCH=0
  for tag in $(git tag -l "v${TODAY_PREFIX}.*" 2>/dev/null); do
    P="${tag##*.}"
    if [[ "$P" =~ ^[0-9]+$ ]] && (( P > PATCH )); then
      PATCH=$P
    fi
  done
  PATCH=$((PATCH + 1))
  NEXT="${TODAY_PREFIX}.${PATCH}"
fi

TAG="v${NEXT}"

echo -e "Next version:    ${GREEN}${NEXT}${NC}  (tag: ${TAG})"
echo ""

# ── Show commits since last tag ──
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
echo -e "${CYAN}Commits to include:${NC}"
if [[ -n "$LATEST_TAG" ]]; then
  git log --oneline "${LATEST_TAG}..HEAD" 2>/dev/null || git log --oneline -10
else
  git log --oneline -10
fi
echo ""

if [[ "${1:-}" == "--dry" ]]; then
  echo "Dry run — no changes made."
  exit 0
fi

# ── Confirm ──
read -p "Release ${TAG}? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# ── Sync version in package.json ──
echo -e "${CYAN}Syncing version ${NEXT}...${NC}"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEXT}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "  package.json → ${NEXT}"

# ── Commit, tag, push ──
git add package.json
git commit -m "release: ${NEXT}"
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin HEAD "${TAG}"

echo ""
echo -e "${GREEN}Released ${TAG}!${NC}"

REMOTE_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
echo -e "Actions: ${YELLOW}${REMOTE_URL}/actions${NC}"
echo -e "Release: ${YELLOW}${REMOTE_URL}/releases/tag/${TAG}${NC}"
