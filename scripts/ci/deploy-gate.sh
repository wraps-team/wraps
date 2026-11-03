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
# `success`, or nothing. Any API failure prints nothing and returns 0, so the
# caller deploys. Each way of finding nothing says why on stderr (which stays in
# the step log, not in the captured sha): `::warning::` for API failures,
# `::notice::` for the expected bootstrap, so a lost permission cannot quietly
# turn the gate into "always deploy".
#
# A deployment whose status was read and is not `success` (failed, in progress,
# or never given one) is skipped in favour of the one before it. A status that
# cannot be read at all is different: it fails open. Falling back to an older
# record would diff against a stale baseline, and a revert of the newest deploy
# (whose status could not be read) would then look like "nothing changed".
# Only the first 30 are considered; the newest success is almost always the
# first or second.
#
# Each `gh` call is bounded (DEPLOY_GATE_GH_TIMEOUT seconds, default 20) so a
# stalled API fails open instead of running the job into its timeout. A timeout
# exits 124, which lands in the same failure branches as any other gh error; the
# exit code is in each warning so the two can be told apart.
last_deployed_sha() {
  local timeout_s="${DEPLOY_GATE_GH_TIMEOUT:-20}"
  local deployments rows id sha state rc count=0

  deployments=$(timeout "$timeout_s" gh api \
    "repos/$GITHUB_REPOSITORY/deployments?environment=api-$STAGE&per_page=30") || {
    rc=$?
    echo "::warning::could not list api-$STAGE deployments (exit $rc): deploying without a baseline" >&2
    return 0
  }

  if ! jq -e 'type == "array"' <<<"$deployments" >/dev/null 2>&1; then
    echo "::warning::api-$STAGE deployments response is not a JSON array: deploying without a baseline" >&2
    return 0
  fi

  rows=$(jq -r '.[] | select(.id != null and .sha != null) | [.id, .sha] | @tsv' <<<"$deployments") || {
    echo "::warning::could not parse the api-$STAGE deployments response: deploying without a baseline" >&2
    return 0
  }

  while IFS=$'\t' read -r id sha; do
    [ -n "$id" ] || continue
    count=$((count + 1))
    # Statuses come newest first, so the first one is the deployment's state.
    state=$(timeout "$timeout_s" gh api \
      "repos/$GITHUB_REPOSITORY/deployments/$id/statuses?per_page=1" |
      jq -r '.[0].state // ""') || {
      rc=$?
      echo "::warning::could not read the status of api-$STAGE deployment $id (exit $rc): deploying without a baseline" >&2
      return 0
    }
    if [ "$state" = "success" ]; then
      echo "$sha"
      return 0
    fi
  done <<<"$rows"

  if [ "$count" -eq 0 ] && jq -e 'length > 0' <<<"$deployments" >/dev/null 2>&1; then
    echo "::warning::api-$STAGE deployments came back without ids: deploying without a baseline" >&2
  elif [ "$count" -eq 0 ]; then
    echo "::notice::no api-$STAGE deployment record yet (expected on the first run after this gate shipped)" >&2
  else
    echo "::warning::none of the $count newest api-$STAGE deployments has a success status" >&2
  fi
}

last=$(last_deployed_sha)

# No usable record (the first run after this gate shipped is the intended
# bootstrap): deploy rather than guess. Every way of getting here printed its
# reason above.
if [ -z "$last" ]; then
  deploy "no previous deploy to compare against"
fi

# Its commit is not in this history (a force push): deploy rather than guess.
if ! git cat-file -e "${last}^{commit}" 2>/dev/null; then
  echo "::warning::recorded deploy $last is not in this checkout's history" >&2
  deploy "recorded deploy is not in history"
fi

# Never deploy backwards. A tree diff works the same in both directions, so an
# older commit tested after a newer one shipped (a re-run of a red Test, or a
# manual dispatch of the newest commit while an older Test is still running)
# would list the newer commit's files as changes and roll production back. Only
# exit 0 skips; exit 1 (not an ancestor) and 128 (error) fall through to the
# diff, so an error here never blocks a deploy.
if [ "$last" != "$HEAD_SHA" ] && git merge-base --is-ancestor "$HEAD_SHA" "$last"; then
  echo "deploy=false" >> "$OUT"
  echo "::notice::$HEAD_SHA is older than deployed $last: skipping (dispatch Deploy API by hand to roll back on purpose)"
  echo "$HEAD_SHA is older than deployed $last: skipping"
  exit 0
fi

echo "comparing $last..$HEAD_SHA"

# --no-renames so a file moved out of an API path still lists its old path.
changed=$(git diff --name-only --no-renames "$last" "$HEAD_SHA") ||
  deploy "could not diff $last..$HEAD_SHA"

# Keep in sync with `pnpm --filter "@wraps/api^..." list`. The lockfile and
# workspace file are here because the API takes its dependency versions from the
# pnpm catalog: a catalog-only bump touches neither apps/api nor packages/. Any
# dependency bump therefore deploys; that cost is accepted.
if grep -qE \
  '^(apps/api/|packages/(analytics|auth|core|db|email|email-check|email-send|template-render|unsubscribe-token)/|infra/|sst\.config\.ts$|\.github/workflows/deploy-api\.yml$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$)' \
  <<<"$changed"; then
  deploy "api-relevant paths changed"
fi

echo "deploy=false" >> "$OUT"
echo "nothing api-relevant changed: skipping"
