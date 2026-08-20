#!/usr/bin/env bash
set -euo pipefail

# Build standalone CLI distributions with bundled Node.js runtime
# Usage: ./scripts/build-standalone.sh --platform darwin --arch arm64 [--node-version 22.22.0]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$ROOT_DIR/packages/cli"
NODE_VERSION="22.22.0"
PLATFORM=""
ARCH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --platform) PLATFORM="$2"; shift 2 ;;
    --arch) ARCH="$2"; shift 2 ;;
    --node-version) NODE_VERSION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$PLATFORM" || -z "$ARCH" ]]; then
  echo "Usage: $0 --platform (darwin|linux) --arch (arm64|x64) [--node-version $NODE_VERSION]"
  exit 1
fi

if [[ "$PLATFORM" != "darwin" && "$PLATFORM" != "linux" ]]; then
  echo "Error: --platform must be darwin or linux"
  exit 1
fi

if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
  echo "Error: --arch must be arm64 or x64"
  exit 1
fi

CLI_VERSION=$(node -e "console.log(require('$CLI_DIR/package.json').version)")
echo "Building wraps v${CLI_VERSION} for ${PLATFORM}-${ARCH} (Node.js ${NODE_VERSION})"

# Build CLI if dist doesn't exist
if [[ ! -f "$CLI_DIR/dist/cli.js" ]]; then
  echo "Building CLI..."
  pnpm --filter @wraps.dev/cli build
fi

# Create temp directory, clean up on exit
TMPDIR_BASE=$(mktemp -d)
trap "rm -rf '$TMPDIR_BASE'" EXIT
STAGING="$TMPDIR_BASE/wraps"

echo "Downloading Node.js ${NODE_VERSION} for ${PLATFORM}-${ARCH}..."
NODE_TARBALL="node-v${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
NODE_DL="$TMPDIR_BASE/$NODE_TARBALL"
curl -fsSL -o "$NODE_DL" "$NODE_URL"

# Extract just the node binary
NODE_DIR="$TMPDIR_BASE/node-extract"
mkdir -p "$NODE_DIR"
tar xzf "$NODE_DL" -C "$NODE_DIR" --strip-components=2 "node-v${NODE_VERSION}-${PLATFORM}-${ARCH}/bin/node"

# Create staging structure
mkdir -p "$STAGING/bin" "$STAGING/runtime" "$STAGING/lib"

# Shell wrapper
cat > "$STAGING/bin/wraps" << 'WRAPPER'
#!/bin/sh
WRAPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$WRAPS_DIR/runtime/node" "$WRAPS_DIR/lib/cli.js" "$@"
WRAPPER
chmod +x "$STAGING/bin/wraps"

# Node.js binary
cp "$NODE_DIR/node" "$STAGING/runtime/node"
chmod +x "$STAGING/runtime/node"

# Use pnpm deploy to create pruned production install
echo "Creating production install with pnpm deploy..."
DEPLOY_DIR="$TMPDIR_BASE/deploy"
pnpm --filter @wraps.dev/cli deploy "$DEPLOY_DIR" --prod --legacy --no-strict-peer-dependencies

# Copy node_modules from deploy
cp -R "$DEPLOY_DIR/node_modules" "$STAGING/lib/node_modules"

# Copy package.json for module resolution and version detection
# cli.js reads ../package.json relative to itself, so place it at the staging root
cp "$DEPLOY_DIR/package.json" "$STAGING/lib/package.json"
cp "$DEPLOY_DIR/package.json" "$STAGING/package.json"

# Copy built artifacts from CLI dist
cp "$CLI_DIR/dist/cli.js" "$STAGING/lib/cli.js"
[[ -d "$CLI_DIR/dist/console" ]] && cp -R "$CLI_DIR/dist/console" "$STAGING/lib/console"
[[ -d "$CLI_DIR/dist/lambda" ]] && cp -R "$CLI_DIR/dist/lambda" "$STAGING/lib/lambda"

# Prune unnecessary files from node_modules
echo "Pruning node_modules..."
find "$STAGING/lib/node_modules" -type f \( \
  -name "*.md" -o \
  -name "*.map" -o \
  -name "CHANGELOG*" -o \
  -name "LICENSE*" -o \
  -name "license*" \
\) -delete 2>/dev/null || true

# Remove .ts files but keep .d.ts
find "$STAGING/lib/node_modules" -type f -name "*.ts" ! -name "*.d.ts" -delete 2>/dev/null || true

# Remove test/docs directories
find "$STAGING/lib/node_modules" -type d \( \
  -name "test" -o \
  -name "tests" -o \
  -name "__tests__" -o \
  -name "docs" -o \
  -name ".github" -o \
  -name "example" -o \
  -name "examples" \
\) -exec rm -rf {} + 2>/dev/null || true

# Create tarball
OUTPUT_NAME="wraps-${CLI_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
OUTPUT_PATH="$ROOT_DIR/$OUTPUT_NAME"
echo "Creating tarball..."
tar czf "$OUTPUT_PATH" -C "$TMPDIR_BASE" wraps

SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
echo ""
echo "Built: $OUTPUT_PATH"
echo "Size:  $SIZE"
