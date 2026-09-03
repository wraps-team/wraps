#!/usr/bin/env zsh
# check-all.sh — Agent-friendly CI check pipeline
# Runs all checks, suppresses verbose output on success, surfaces errors clearly.
# Usage: ./scripts/check-all.sh [--verbose]

set -euo pipefail

VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

LOGDIR=$(mktemp -d)
trap 'rm -rf "$LOGDIR"' EXIT

# Force turbo to use streaming output (TUI mode hangs when stdout is redirected)
export TURBO_UI=stream

typeset -a STEPS CMDS
STEPS=(lint migrations typecheck infra baseline deadcode build test scripts)
CMDS=(
  "pnpm check:errors"
  "pnpm --filter @wraps/db exec drizzle-kit check"
  "pnpm typecheck"
  # infra/ is outside the pnpm workspace, so `turbo run typecheck` never visits
  # it — same blind spot as scripts/ below. It cost us a self-host deploy
  # failure: plan 170 used sst.aws.CronV2, which does not exist in the SST
  # platform version pinned under infra/.sst, and nothing caught it.
  "pnpm typecheck:infra"
  "pnpm test:baseline"
  # Ratchet on knip's unused-file count for apps/web routes/components — see
  # scripts/check-dead-ui.sh. Deliberately not in check:fast: knip's runtime
  # is much longer than the ~10-15s budget that gate is built to protect.
  "pnpm check:deadcode"
  "pnpm build"
  "pnpm test"
  # scripts/ is outside the pnpm workspace, so `pnpm test` (turbo) never sees
  # it. Without this step the selfhost deploy/upgrade/migrate tests run in no
  # gate at all.
  "pnpm test:scripts"
)

typeset -a RESULTS
PASS=0
FAIL=0
FAILED_STEP=""

for i in {1..${#STEPS}}; do
  step=${STEPS[$i]}
  cmd=${CMDS[$i]}
  logfile="$LOGDIR/$step.log"

  printf "%-12s " "$step"

  if $VERBOSE; then
    if eval "$cmd" 2>&1 | tee "$logfile"; then
      echo ":: PASS $step"
      RESULTS+=("PASS $step")
      (( ++PASS ))
    else
      echo ":: FAIL $step"
      RESULTS+=("FAIL $step")
      (( ++FAIL ))
      FAILED_STEP=$step
      break
    fi
  else
    if eval "$cmd" > "$logfile" 2>&1; then
      echo "PASS"
      RESULTS+=("PASS $step")
      (( ++PASS ))
    else
      echo "FAIL"
      RESULTS+=("FAIL $step")
      (( ++FAIL ))
      FAILED_STEP=$step
      break
    fi
  fi
done

echo ""
echo "--- check:all summary ---"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "FAILED: $FAILED_STEP"
  echo ""

  logfile="$LOGDIR/$FAILED_STEP.log"

  # Step-specific error extraction for agent-friendly output
  case "$FAILED_STEP" in
    lint)
      # Collect all errors in github annotation format
      local lint_tmp="$LOGDIR/lint-github.txt"
      pnpm dlx ultracite@latest check --diagnostic-level=error --reporter=github 2>&1 \
        | grep '^::error' \
        > "$lint_tmp" || true

      # Split into formatting vs lint errors
      local fmt_tmp="$LOGDIR/lint-fmt.txt"
      local rule_tmp="$LOGDIR/lint-rules.txt"
      grep 'title=format' "$lint_tmp" \
        | sed 's/^::error title=format,file=\([^,]*\),.*/  \1/' \
        > "$fmt_tmp" || true
      grep -v 'title=format' "$lint_tmp" \
        | sed 's/^::error title=\([^,]*\),file=\([^,]*\),line=\([^,]*\),.*col=\([^,]*\),.*::\(.*\)/  \2:\3:\4 \1 — \5/' \
        > "$rule_tmp" || true

      if [[ -s "$fmt_tmp" ]]; then
        echo "--- formatting errors (run 'pnpm fix' to auto-fix) ---"
        cat "$fmt_tmp"
        echo ""
      fi

      if [[ -s "$rule_tmp" ]]; then
        echo "--- lint errors ---"
        cat "$rule_tmp"
        echo ""
      fi

      if [[ ! -s "$fmt_tmp" && ! -s "$rule_tmp" ]]; then
        echo "--- errors ---"
        echo "  (none detected — check raw log)"
        echo ""
      fi
      ;;

    typecheck|infra)
      # TypeScript errors: extract "error TS" lines
      echo "--- type errors ---"
      grep -E 'error TS[0-9]+' "$logfile" | head -40 || true
      total=$(grep -cE 'error TS[0-9]+' "$logfile" 2>/dev/null || echo 0)
      if [[ "$total" -gt 40 ]]; then
        echo "  ... and $((total - 40)) more"
      fi
      ;;

    baseline)
      # Architecture test failures
      echo "--- baseline errors ---"
      grep -E '(FAIL|AssertionError|Expected|✗|×|⎯⎯)' "$logfile" | head -40 || true
      ;;

    build)
      # Build errors: extract error lines, skip noise
      echo "--- build errors ---"
      grep -iE '(error|failed|Error:)' "$logfile" | grep -v 'node_modules' | head -40 || true
      ;;

    test)
      # Test failures: extract FAIL lines and assertion errors
      echo "--- test failures ---"
      grep -E '(FAIL |✗|×|AssertionError|Error:|expect\()' "$logfile" | head -40 || true
      total=$(grep -cE '(FAIL |✗|×)' "$logfile" 2>/dev/null || echo 0)
      if [[ "$total" -gt 40 ]]; then
        echo "  ... and $((total - 40)) more"
      fi
      ;;

    *)
      # Fallback: last 40 lines
      echo "--- $FAILED_STEP output (last 40 lines) ---"
      tail -40 "$logfile"
      ;;
  esac

  echo ""
  echo "--- end $FAILED_STEP output ---"
  echo "Re-run with: ${CMDS[${STEPS[(i)$FAILED_STEP]}]}"
  exit 1
fi

echo ""
echo "ALL CHECKS PASSED ($PASS/$PASS)"
