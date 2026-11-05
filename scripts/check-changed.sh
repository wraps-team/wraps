#!/usr/bin/env bash
# check-changed.sh — diff-only quick gate. The inner-loop sibling of check-all.sh.
#
# check:all is the full pre-merge gate: whole-repo lint, a build, every package's
# tests. This runs only what the diff can have affected, at low priority, so a
# desktop stays usable while it runs. It never replaces check:all: it skips build
# and knip, and scopes lint/typecheck/test to what changed.
#
#   lint        biome on the changed files only (no whole-repo scan)
#   design      only when a design-lint surface changed
#   migrations  only when packages/db changed
#   typecheck   turbo --affected: changed packages plus their dependents (cached)
#   infra       only when sst.config.ts or infra/ changed
#   baseline    architecture tests + baseline scan (same as check:fast)
#   test        turbo, directly changed packages only, throttled
#
# Usage: ./scripts/check-changed.sh [--verbose]
# Env:   CHECK_BASE=<ref>        diff base (default: merge-base with origin/main, else main)
#        CHECK_TEST_DEPENDENTS=1 also test packages that depend on a changed one

set -euo pipefail

VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

cd "$(git rev-parse --show-toplevel)"

BASE_REF=${CHECK_BASE:-}
if [[ -z "$BASE_REF" ]]; then
  if git rev-parse --verify -q origin/main >/dev/null; then BASE_REF=origin/main; else BASE_REF=main; fi
fi
BASE=$(git merge-base HEAD "$BASE_REF")

# turbo --affected diffs against this ref too, so both halves agree on "changed".
export TURBO_SCM_BASE=$BASE
export TURBO_UI=stream

# Everything here shares the machine with a desktop: stay out of its way.
# 8 cores -> 4 turbo tasks x 2 vitest workers. Respect a caller's override.
NPROC=$(nproc)
export VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-2}
CONC=$(( NPROC / 2 )); (( CONC < 1 )) && CONC=1
NICE="nice -n 10"

# Committed since the base + staged + unstaged + untracked. Deleted files drop out
# (nothing to lint); they still count for --affected via turbo's own git diff.
CHANGED=$(
  {
    git diff --name-only --diff-filter=d "$BASE"
    git ls-files --others --exclude-standard
  } | sort -u
)

if [[ -z "$CHANGED" ]]; then
  echo "No changes vs $BASE_REF. Nothing to check."
  exit 0
fi

changed() { grep -Eq "$1" <<<"$CHANGED"; }

LOGDIR=$(mktemp -d)
trap 'rm -rf "$LOGDIR"' EXIT

PASS=0
SKIP=0
RESULTS=()

run_step() {
  local step=$1 cmd=$2 logfile="$LOGDIR/$1.log" start=$SECONDS
  printf "%-12s " "$step"
  if $VERBOSE; then
    echo
    if ! eval "$cmd" 2>&1 | tee "$logfile"; then fail "$step" "$cmd" "$logfile"; fi
  else
    if ! eval "$cmd" >"$logfile" 2>&1; then
      echo "FAIL"
      fail "$step" "$cmd" "$logfile"
    fi
  fi
  local took=$(( SECONDS - start ))
  echo "PASS (${took}s)"
  RESULTS+=("PASS $step (${took}s)")
  (( ++PASS ))
}

skip_step() {
  printf "%-12s SKIP (%s)\n" "$1" "$2"
  RESULTS+=("SKIP $1")
  (( ++SKIP ))
}

fail() {
  local step=$1 cmd=$2 logfile=$3
  echo ""
  echo "FAILED: $step"
  echo ""
  # Strip colour, then lead with the lines that name the failure: a turbo/vitest
  # log ends in passing-test noise, so a bare tail hides the cause.
  local clean="$LOGDIR/$step.clean.log"
  sed -E "s/"$'\033'"\[[0-9;]*[A-Za-z]//g" "$logfile" >"$clean"
  echo "--- failures ---"
  grep -E '( FAIL |AssertionError|error TS[0-9]+|✗|×|ELIFECYCLE|Command failed|ERROR )' "$clean" | head -40 || true
  echo ""
  echo "--- last 20 lines ---"
  tail -20 "$clean"
  echo ""
  echo "Re-run with: $cmd"
  exit 1
}

# --- lint: only the files that changed ---------------------------------------
# Extension filter mirrors biome.jsonc files.includes; biome.jsonc sets
# ignoreUnknown:false, so handing it a .md or .sh would be an error.
LINT_FILES=$(grep -E '\.(ts|tsx|js|jsx|json|jsonc)$' <<<"$CHANGED" || true)
if [[ -n "$LINT_FILES" ]]; then
  printf '%s\n' "$LINT_FILES" >"$LOGDIR/lint-files.txt"
  run_step lint "tr '\\n' '\\0' <'$LOGDIR/lint-files.txt' | $NICE xargs -0 pnpm exec biome check --diagnostic-level=error --no-errors-on-unmatched"
else
  skip_step lint "no lintable files changed"
fi

# --- design lint: whole-surface oxlint, so gate on the surfaces ---------------
if changed '^(apps/web/src|apps/website/src|packages/ui/src|packages/console/src)/' \
  || changed '^scripts/check-design-lint\.mjs$'; then
  run_step design "$NICE pnpm check:design"
else
  skip_step design "no design-lint surface changed"
fi

# --- migrations --------------------------------------------------------------
if changed '^packages/db/'; then
  run_step migrations "$NICE pnpm --filter @wraps/db exec drizzle-kit check"
else
  skip_step migrations "packages/db unchanged"
fi

# --- typecheck: changed packages + dependents; turbo caches the result --------
run_step typecheck "$NICE pnpm exec turbo run typecheck --affected --concurrency=$CONC"

# --- infra: outside the pnpm workspace, so turbo never sees it ----------------
if changed '^(sst\.config\.ts|infra/|tsconfig\.base\.json)'; then
  run_step infra "$NICE pnpm typecheck:infra"
else
  skip_step infra "sst.config.ts and infra/ unchanged"
fi

# --- baseline: architecture tests + baseline scan (the check:fast tail) --------
run_step baseline "$NICE pnpm test:baseline"

# --- tests: directly changed packages only, throttled -------------------------
# Not --affected: that pulls in dependents, and a leaf change (unsubscribe-token)
# then runs the real-database suites in apps/api and apps/web, ~7 min at 2 workers.
# Dependents are type-checked above; check:all and CI run their tests.
# CHECK_TEST_DEPENDENTS=1 widens this to --affected.
if [[ "${CHECK_TEST_DEPENDENTS:-0}" == "1" ]]; then
  TEST_SCOPE="--affected"
else
  TEST_SCOPE="--filter=[$BASE]"
fi
run_step test "$NICE pnpm exec turbo run test $TEST_SCOPE --concurrency=$CONC"

# --- scripts/: outside the workspace, so turbo's test never sees it ------------
if changed '^scripts/'; then
  run_step scripts "$NICE pnpm test:scripts"
else
  skip_step scripts "scripts/ unchanged"
fi

echo ""
echo "--- check:changed summary (base: $BASE_REF @ ${BASE:0:8}) ---"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
echo "Skipped by design: build, knip (check:deadcode). Run 'pnpm check:all' before merging."
echo "CHANGED CHECKS PASSED ($PASS passed, $SKIP skipped)"
