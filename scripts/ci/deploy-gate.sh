#!/usr/bin/env bash
# Decides whether the Deploy API workflow's `deploy` job should run.
#
# Called by the `decide` step of the `gate` job in .github/workflows/deploy-api.yml
# from a full-history checkout of the tested commit. Tested by
# scripts/__tests__/deploy-gate.test.ts, which runs it against a throwaway git
# repo with a stubbed `gh`.
#
# Inputs (environment):
#   HEAD_SHA           the tested commit
#   EVENT_NAME         github.event_name
#   STAGE              the stage being deployed (production for workflow_run)
#   GITHUB_REPOSITORY  owner/name, for the Deployments API
#   GITHUB_OUTPUT      file receiving `sha=` and `deploy=` (stdout when unset)
#
# "What was last deployed" is the newest GitHub Deployment of the environment
# `api-$STAGE` whose latest status is `success`. The `deploy` job writes that
# record after `sst deploy` succeeds, so it names a commit that really reached
# the stage. Past runs of the workflow cannot stand in for it: a run whose gate
# decided to skip still concludes `success`, and a `workflow_run` run's own
# head_sha is main's HEAD when it was triggered, not the commit it tested. On
# 2026-11-03 that made #247 (API) compare bf89a46..bf89a46 after the docs-only
# #248 had been "deployed" by a skipped run, and it never shipped.
#
# Every failure to learn the last deploy falls through to deploying. This job
# exists to stop deploys going missing quietly; an extra deploy is cheap.
set -euo pipefail

: "${HEAD_SHA:?HEAD_SHA is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"
: "${STAGE:?STAGE is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"

echo "sha=$HEAD_SHA" >> "$OUT"

deploy() {
  echo "deploy=true" >> "$OUT"
  echo "$1: deploying"
  exit 0
}

# The manual button exists to ship out of band — never second-guess it.
if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
  deploy "manual dispatch"
fi

# Prints the sha of the newest `api-$STAGE` deployment whose latest status is
# `success`, or nothing. Any API failure prints nothing.
#
# A deployment that failed, is still in progress, or was never given a status is
# skipped in favour of the one before it. Only the first 30 are considered; the
# newest success is almost always the first or second.
last_deployed_sha() {
  local deployments id sha state
  deployments=$(gh api \
    "repos/$GITHUB_REPOSITORY/deployments?environment=api-$STAGE&per_page=30" \
    2>/dev/null) || return 0

  while IFS=$'\t' read -r id sha; do
    [ -n "$id" ] || continue
    # Statuses come newest first, so the first one is the deployment's state.
    state=$(gh api \
      "repos/$GITHUB_REPOSITORY/deployments/$id/statuses?per_page=1" \
      2>/dev/null | jq -r '.[0].state // ""') || continue
    if [ "$state" = "success" ]; then
      echo "$sha"
      return 0
    fi
  done < <(jq -r '.[] | [.id, .sha] | @tsv' <<<"$deployments" 2>/dev/null || true)
}

last=$(last_deployed_sha)

# No record yet (the first run after this gate shipped, which is the intended
# bootstrap), or its commit is not in this history (a force push): deploy
# rather than guess.
if [ -z "$last" ] || ! git cat-file -e "${last}^{commit}" 2>/dev/null; then
  deploy "no usable previous deploy"
fi

echo "comparing $last..$HEAD_SHA"

changed=$(git diff --name-only "$last" "$HEAD_SHA") ||
  deploy "could not diff $last..$HEAD_SHA"

# Keep in sync with `pnpm --filter "@wraps/api^..." list`.
if grep -qE \
  '^(apps/api/|packages/(analytics|auth|core|db|email|email-check|email-send|template-render|unsubscribe-token)/|infra/|sst\.config\.ts$|\.github/workflows/deploy-api\.yml$)' \
  <<<"$changed"; then
  deploy "api-relevant paths changed"
fi

echo "deploy=false" >> "$OUT"
echo "nothing api-relevant changed: skipping"
