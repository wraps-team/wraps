#!/usr/bin/env zsh
# Setup a git worktree with env files, .claude context, and ai-notes.
# Uses symlinks so updates in any worktree are reflected everywhere.
#
# Usage: ./scripts/setup-worktree.sh <branch> [path]
#   branch: branch name to checkout (created if doesn't exist)
#   path:   worktree directory (default: ../wraps.<branch>)
#
# Idempotent, and safe to point at a directory that is ALREADY a worktree —
# agent skills (loom, sdlc, improve) create the worktree themselves and then
# call this to provision it. Nothing here deletes anything it did not create.
#
# Env:
#   WORKTREE_KEEP_CLAUDE=1  do not symlink .claude into the main tree. Agent
#                           skills set this because they own .claude/<ns>/<feature>
#                           inside the worktree; replacing .claude with a symlink
#                           would redirect their artifact writes into the main
#                           checkout and destroy the isolation they exist for.

set -euo pipefail

MAIN_TREE="$(git worktree list --porcelain | head -1 | sed 's/^worktree //')"
BRANCH="${1:?Usage: setup-worktree.sh <branch> [path]}"
WORKTREE="${2:-$(dirname "$MAIN_TREE")/wraps.${BRANCH}}"

# --- Create worktree ---
if [[ -d "$WORKTREE" ]]; then
  echo "Worktree already exists at $WORKTREE — provisioning it in place"
else
  if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    git worktree add "$WORKTREE" "$BRANCH"
  else
    git worktree add -b "$BRANCH" "$WORKTREE"
  fi
  echo "Created worktree at $WORKTREE"
fi

# --- Symlink env files ---
# .env.test is the load-bearing one: scripts/test-db/resolve-branch.mjs reads
# NEON_API_KEY/NEON_PROJECT_ID from it to cut this worktree its own Neon test
# branch. Without it the resolver takes its silent fallback and the worktree
# runs tests against the SHARED test database, colliding with every other run.
ENV_FILES=(
  "apps/web/.env.local"
  "apps/web/.env.test"
  "apps/website/.env"
  "apps/website/.env.local"
)

linked=0
missing=()
for f in "${ENV_FILES[@]}"; do
  src="$MAIN_TREE/$f"
  dst="$WORKTREE/$f"
  if [[ ! -f "$src" ]]; then
    missing+=("$f")
    continue
  fi
  if [[ -e "$dst" ]]; then
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  linked=$(( linked + 1 ))
done
echo "Linked $linked env file(s)"

if (( ${#missing} )); then
  echo "WARNING — absent from the main checkout, so NOT linked:"
  printf '  %s\n' "${missing[@]}"
fi

# apps/web/.env.test is not optional for anyone who will run tests here.
if [[ ! -e "$WORKTREE/apps/web/.env.test" ]]; then
  echo "WARNING — no apps/web/.env.test in this worktree."
  echo "  Tests will fall back to the SHARED Neon test database and can collide"
  echo "  with other worktrees on the fixed-ID fixtures (test-org-123 et al.)."
fi

# --- Symlink shared directories (.claude, ai-notes, notes) ---
SHARED_DIRS=(ai-notes notes)
if [[ "${WORKTREE_KEEP_CLAUDE:-0}" == "1" ]]; then
  echo "Keeping the worktree's own .claude (WORKTREE_KEEP_CLAUDE=1)"
else
  SHARED_DIRS=(.claude $SHARED_DIRS)
fi

shared_linked=0
for d in "${SHARED_DIRS[@]}"; do
  src="$MAIN_TREE/$d"
  dst="$WORKTREE/$d"
  [[ -d "$src" ]] || continue
  [[ -L "$dst" ]] && continue   # already symlinked
  # Remove the git-created directory if present (worktree copies tracked files)
  [[ -d "$dst" ]] && rm -rf "$dst"
  ln -s "$src" "$dst"
  shared_linked=$(( shared_linked + 1 ))
done
echo "Linked $shared_linked shared dir(s)"

# --- Install dependencies ---
echo "Installing dependencies..."
(cd "$WORKTREE" && pnpm install --frozen-lockfile)

# --- Declare what this repo needs beyond install, and what it owes on teardown ---
# Agent skills read these two lines from stdout instead of rediscovering them.
# Keep the key= prefixes; they are the contract.
echo ""
echo "bootstrap=node_modules/.bin/sst install && (cd infra && ../node_modules/.bin/sst install --config selfhost.config.ts --stage production)"
echo "reclaim=node scripts/test-db/reap-branches.mjs"

echo ""
echo "Ready: $WORKTREE"
echo "  cd $WORKTREE"
echo ""
echo "  Before any full-CI run (pnpm check:all), run the bootstrap above:"
echo "  typecheck:infra is a bare tsc over generated .sst/platform config.d.ts"
echo "  that no build produces. pnpm typecheck alone is fine without it."
echo ""
echo "  AFTER you remove this worktree, run the reclaim above: it deletes the"
echo "  wt-* Neon branch this checkout owns. It finds orphans by the ABSENCE of"
echo "  the checkout, so running it first finds nothing and leaks the branch."
