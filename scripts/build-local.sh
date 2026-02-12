#!/usr/bin/env bash
# Build oomp locally and publish as a GitHub release.
# Usage: ./scripts/build-local.sh [version]
#   version: e.g. 11.14.7 (without v prefix)
#   If omitted, bumps patch from latest tag.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

REPO="ozanturksever/oh-my-pi"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

# Resolve version
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

# Ensure nightly rust is on PATH
for candidate in \
  "$HOME/.rustup/toolchains/nightly-aarch64-apple-darwin/bin" \
  "$HOME/.rustup/toolchains/nightly-x86_64-apple-darwin/bin" \
  "$HOME/.rustup/toolchains/nightly-x86_64-unknown-linux-gnu/bin" \
  "$HOME/.rustup/toolchains/nightly-aarch64-unknown-linux-gnu/bin"; do
  if [ -d "$candidate" ]; then
    export PATH="$candidate:$PATH"
    break
  fi
done

echo "=== Building oomp $TAG ($PLATFORM-$ARCH) ==="
echo ""

# 1. Build native addon
echo "[1/4] Building native addon..."
bun --cwd=packages/natives run build:native

# 2. Embed native addon
echo "[2/4] Embedding native addon..."
bun --cwd=packages/natives run embed:native

# 3. Compile binary
echo "[3/4] Compiling binary..."
mkdir -p packages/coding-agent/binaries
bun build --compile \
  --define PI_COMPILED=true \
  --root . \
  ./packages/coding-agent/src/cli.ts \
  --outfile "packages/coding-agent/binaries/oomp-${PLATFORM}-${ARCH}"

# Reset embed
bun --cwd=packages/natives run embed:native --reset

BINARY="packages/coding-agent/binaries/oomp-${PLATFORM}-${ARCH}"
echo ""
echo "Built: $BINARY ($(du -h "$BINARY" | cut -f1))"
echo ""

# 4. Create release and upload
echo "[4/4] Publishing $TAG to GitHub..."

# Tag and push
git tag -f "$TAG" >/dev/null 2>&1
git push origin main 2>/dev/null
git push origin "$TAG" --force 2>/dev/null

# Create release (or update existing)
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "  Release $TAG exists, uploading asset..."
  gh release upload "$TAG" "$BINARY" --repo "$REPO" --clobber
else
  echo "  Creating release $TAG..."
  gh release create "$TAG" "$BINARY" --repo "$REPO" --title "$TAG" --generate-notes
fi

echo ""
echo "=== Done ==="
echo "Release: https://github.com/$REPO/releases/tag/$TAG"
echo "Install: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | bash"
