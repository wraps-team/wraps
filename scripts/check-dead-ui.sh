#!/usr/bin/env bash
# check-dead-ui.sh — Ratchet knip's "Unused files" count for routes and
# components under apps/web/src/{app,components}.
#
# Why: two dead-UI incidents on 2026-09-02 (a route reading a path deleted
# 7 months earlier, and a fully-written component nothing rendered) were
# both invisible in this exact slice of knip's output. knip already finds
# them; nothing gated it. See plans/237-knip-dead-ui-ratchet.md.
#
# This gates ONLY unused files under apps/web/src/app/** and
# apps/web/src/components/** — not knip's other categories (unused
# exports/types/dependencies), and not apps/website. Those are out of
# scope; see the plan for why.
#
# The ceiling may only go DOWN. When cleanup lands, lower it in the same
# commit — the script prints a reminder when the count is below ceiling so
# this doesn't silently rot.
set -uo pipefail

# Ceiling: measured count of unused files matching the pattern below on
# 2026-09-02 at commit c91f6043. Lower this whenever files in the slice are
# deleted or wired up. Never raise it to make a failing run pass.
CEILING=29

PATTERN='^apps/web/src/(app|components)/'

# `set -e` is deliberately not used: knip exits non-zero whenever it finds
# anything repo-wide (it does today, for categories we don't gate here), so
# a non-zero exit from knip is expected and must not abort this script.
KNIP_OUTPUT=$(pnpm knip 2>&1)

# Extract only the "Unused files" section: from the line after the
# "Unused files (N)" heading up to (but not including) the next "Unused "
# heading. Other sections (exports, types, dependencies) also contain file
# paths, so scanning the whole output would inflate the count.
UNUSED_FILES=$(printf '%s\n' "$KNIP_OUTPUT" | awk '
  /^Unused files \(/ { in_section = 1; next }
  in_section && /^Unused / { in_section = 0 }
  in_section { print }
')

# Note: intentionally NOT `printf ... | grep -q ...` — with pipefail set,
# grep -q's early exit on the first match sends SIGPIPE to printf, which
# makes the pipeline report non-zero even when grep found its match. A
# here-string sidesteps that.
if [[ -z "$KNIP_OUTPUT" ]] || ! grep -q '^Unused files (' <<< "$KNIP_OUTPUT"; then
  echo "check-dead-ui: could not find an 'Unused files (N)' heading in knip's output."
  echo "knip's reporter format may have changed. Not falling back to a guess — fix this script."
  echo "--- knip output ---"
  printf '%s\n' "$KNIP_OUTPUT"
  exit 1
fi

# Trim trailing whitespace (knip right-pads paths to align columns) before
# matching or printing.
MATCHES=$(printf '%s\n' "$UNUSED_FILES" | sed 's/[[:space:]]*$//' | grep -E "$PATTERN" || true)
COUNT=$(printf '%s\n' "$MATCHES" | grep -c . || true)

if (( COUNT > CEILING )); then
  echo "check-dead-ui: FAIL — $COUNT unused files under apps/web/src/{app,components}, ceiling is $CEILING."
  echo ""
  echo "Offending files (delete the dead one, or wire it up so knip sees it used):"
  printf '%s\n' "$MATCHES" | sed 's/^/  /'
  exit 1
elif (( COUNT < CEILING )); then
  echo "check-dead-ui: PASS — $COUNT unused files under apps/web/src/{app,components} (ceiling $CEILING)."
  echo "check-dead-ui: count is BELOW the ceiling — lower CEILING in scripts/check-dead-ui.sh to $COUNT to lock in the improvement."
  exit 0
else
  echo "check-dead-ui: PASS — $COUNT unused files under apps/web/src/{app,components}, at ceiling ($CEILING)."
  exit 0
fi
