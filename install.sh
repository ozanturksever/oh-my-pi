#!/usr/bin/env bash
# Install omp from ozanturksever/oh-my-pi fork releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/ozanturksever/oh-my-pi/main/install.sh | bash
set -euo pipefail

REPO="ozanturksever/oh-my-pi"
INSTALL_DIR="${OMP_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="oomp"

# --- helpers ---

die() { echo "Error: $*" >&2; exit 1; }

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="darwin" ;;
    *)       die "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)             die "Unsupported architecture: $arch" ;;
  esac
}

get_latest_version() {
  if command -v gh &>/dev/null; then
    VERSION="$(gh release view --repo "$REPO" --json tagName -q .tagName 2>/dev/null || true)"
  fi
  if [ -z "${VERSION:-}" ]; then
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  fi
  [ -n "$VERSION" ] || die "Could not determine latest release version"
}

download_and_install() {
  local asset_name="oomp-${PLATFORM}-${ARCH}"
  local url="https://github.com/$REPO/releases/download/$VERSION/$asset_name"

  echo "Installing $BINARY_NAME $VERSION ($PLATFORM/$ARCH)..."
  echo "  From: $url"
  echo "  To:   $INSTALL_DIR/$BINARY_NAME"

  mkdir -p "$INSTALL_DIR"

  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "${tmp:-}"' EXIT

  if curl -fSL --progress-bar -o "$tmp" "$url"; then
    chmod +x "$tmp"
    mv "$tmp" "$INSTALL_DIR/$BINARY_NAME"
  else
    die "Download failed. Check that release $VERSION has asset: $asset_name"
  fi

  # Verify
  if "$INSTALL_DIR/$BINARY_NAME" --version &>/dev/null; then
    echo ""
    echo "Installed: $("$INSTALL_DIR/$BINARY_NAME" --version)"
  else
    echo ""
    echo "Binary installed but version check failed (may need different platform)."
  fi

  # PATH hint
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "Add to your PATH (if not already):"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    echo "Add this to your ~/.bashrc, ~/.zshrc, or equivalent."
  fi
}

# --- main ---

echo "oomp installer (fork: $REPO)"
echo ""

detect_platform
VERSION="${OMP_VERSION:-}"
if [ -z "$VERSION" ]; then
  get_latest_version
fi
download_and_install
