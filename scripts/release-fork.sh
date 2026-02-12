#!/usr/bin/env bash
# Release a new version to your fork.
# Usage: ./scripts/release-fork.sh [version]
#   version: e.g. 11.14.5 (without v prefix)
#   If omitted, bumps the patch version from the latest tag.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  LATEST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")"
  LATEST="${LATEST_TAG#v}"
  IFS='.' read -r MAJOR MINOR PATCH <<< "$LATEST"
  PATCH=$((PATCH + 1))
  VERSION="${MAJOR}.${MINOR}.${PATCH}"
fi

TAG="v${VERSION}"
echo "Releasing $TAG to fork..."

# Ensure we're pushing to the fork
ORIGIN_URL="$(git remote get-url origin)"
if echo "$ORIGIN_URL" | grep -q "can1357"; then
  echo "Error: origin points to upstream (can1357). Set origin to your fork first."
  exit 1
fi

git tag "$TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "Pushed $TAG. GitHub Actions will build binaries and create a release."
echo "Watch: gh run watch --repo $(git remote get-url origin | sed 's|.*github.com/||;s|\.git$||')"
