#!/usr/bin/env zsh
#
# Run workflow devkit e2e tests against world-aws.
#
# Requires SST dev running separately (`pnpm sst:dev`).
# The full path: queue() → SQS → SST Lambda → HTTP → createQueueHandler → execute
#
# Usage:
#   ./scripts/e2e.sh                    # Build, link, start dev server, run tests, cleanup
#   ./scripts/e2e.sh --setup            # Also create DynamoDB tables + SQS queues first
#   ./scripts/e2e.sh --app example      # Use a different workbench app
#   ./scripts/e2e.sh --test-filter hook # Pass filter pattern to vitest
#   ./scripts/e2e.sh --skip-build       # Skip build step (if already built)
#
# Prerequisites:
#   1. Run `world-aws-setup --region us-east-1` to create tables + queues (or use --setup)
#   2. Run `pnpm sst:dev` in a separate terminal (Live Lambda Dev)
#
# Environment:
#   WORKFLOW_REPO   Path to workflow devkit repo (default: ~/Projects/workflow)

set -euo pipefail

WORLD_AWS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW_REPO="${WORKFLOW_REPO:-$HOME/Projects/workflow}"
APP_NAME="nextjs-turbopack"
PORT=3000
RUN_SETUP=false
SKIP_BUILD=false
TEST_FILTER=""
DEV_PID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --setup)       RUN_SETUP=true; shift ;;
    --app)         APP_NAME="$2"; shift 2 ;;
    --port)        PORT="$2"; shift 2 ;;
    --skip-build)  SKIP_BUILD=true; shift ;;
    --test-filter) TEST_FILTER="$2"; shift 2 ;;
    --help|-h)
      sed -n '3,17p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate workflow repo exists
if [[ ! -d "$WORKFLOW_REPO/packages/core/e2e" ]]; then
  echo "error: Workflow devkit repo not found at $WORKFLOW_REPO"
  echo "Set WORKFLOW_REPO or pass --workflow-repo <path>"
  exit 1
fi

cleanup() {
  echo ""
  if [[ -n "$DEV_PID" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    echo "Stopping dev server (pid $DEV_PID)..."
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- Step 1: Setup AWS resources ---
if [[ "$RUN_SETUP" == "true" ]]; then
  echo "==> Setting up AWS resources..."
  node "$WORLD_AWS_DIR/bin/world-aws-setup.js" --region us-east-1
  echo ""
fi

# --- Step 2: Build world-aws ---
if [[ "$SKIP_BUILD" == "true" ]]; then
  echo "==> Skipping build (--skip-build)"
else
  echo "==> Building world-aws..."
  (cd "$WORLD_AWS_DIR" && pnpm build 2>&1 | tail -3)
fi
echo ""

# --- Step 3: Link into workbench app ---
echo "==> Linking world-aws into $APP_NAME..."
LINK_PATH="link:$WORLD_AWS_DIR"
CURRENT=$(cd "$WORKFLOW_REPO" && node -e "
  const pkg = require('./workbench/$APP_NAME/package.json');
  console.log(pkg.dependencies?.['@wraps.dev/world-aws'] ?? 'not-installed');
" 2>/dev/null || echo "not-installed")

if [[ "$CURRENT" != "$LINK_PATH" ]]; then
  (cd "$WORKFLOW_REPO" && pnpm --filter "$APP_NAME" add "@wraps.dev/world-aws@$LINK_PATH")
else
  echo "  Already linked, skipping install"
fi
echo ""

# --- Step 4: Start dev server ---
echo "==> Starting $APP_NAME dev server on port $PORT..."
(
  cd "$WORKFLOW_REPO/workbench/$APP_NAME"
  WORKFLOW_TARGET_WORLD=@wraps.dev/world-aws \
  PORT=$PORT \
  pnpm dev > /tmp/world-aws-e2e-dev.log 2>&1
) &
DEV_PID=$!

echo "  PID: $DEV_PID, logs: /tmp/world-aws-e2e-dev.log"
echo "  Waiting for server..."

for i in {1..60}; do
  if curl -sf "http://localhost:$PORT" > /dev/null 2>&1; then
    echo "  Ready! (${i}s)"
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "  error: Dev server exited. Check /tmp/world-aws-e2e-dev.log"
    tail -20 /tmp/world-aws-e2e-dev.log
    exit 1
  fi
  if [[ $i -eq 60 ]]; then
    echo "  error: Timed out after 60s. Check /tmp/world-aws-e2e-dev.log"
    tail -20 /tmp/world-aws-e2e-dev.log
    exit 1
  fi
  sleep 1
done
echo ""

# --- Step 5: Verify SST dev is running ---
echo "==> Checking SST dev is running..."
if ! curl -sf "http://localhost:$PORT/.well-known/workflow/v1/flow" > /dev/null 2>&1; then
  echo "  warning: Could not reach workflow endpoint — SST dev Lambda will forward SQS messages here"
fi
echo "  Ensure 'pnpm sst:dev' is running in another terminal"
echo ""

# --- Step 6: Run e2e tests ---
echo "==> Running e2e tests..."
VITEST_ARGS=(packages/core/e2e/e2e.test.ts)
if [[ -n "$TEST_FILTER" ]]; then
  VITEST_ARGS+=(-t "$TEST_FILTER")
fi

(
  cd "$WORKFLOW_REPO"
  DEPLOYMENT_URL="http://localhost:$PORT" \
  APP_NAME="$APP_NAME" \
  pnpm vitest run "${VITEST_ARGS[@]}"
)

echo ""
echo "==> Done!"
