#!/usr/bin/env bash
# Tear down a git worktree made by setup-worktree.sh, in one command.
#
# Usage: ./scripts/remove-worktree.sh [--restore-only] <path>
#
# setup-worktree.sh replaces the worktree's tracked .claude directory with a
# symlink into the main tree (and links ai-notes/notes). That makes the worktree
# look dirty, so `git worktree remove` refuses and `git rebase` refuses. This:
#   1. refuses the main tree and anything that is not a registered worktree;
#   2. unlinks the shared-dir symlinks, and restores .claude from HEAD when it
#      replaced a tracked directory;
#   3. stops (exit 1, nothing removed) if the worktree is still dirty;
#   4. runs `git worktree remove` (never --force);
#   5. runs scripts/test-db/reap-branches.mjs from the main tree, AFTER the
#      removal, so the orphaned wt-* Neon branch is reclaimed.
#
# --restore-only runs steps 1-2 only (to rebase in a worktree) and prints the
# commands that put the symlinks back afterwards.
#
# Nothing here deletes files: no rm, no --force, no stash.
#
# Run it from the repo you want to act on (the main checkout or any worktree).

set -euo pipefail

SHARED_DIRS=(.claude ai-notes notes)

usage() {
  echo "Usage: remove-worktree.sh [--restore-only] <path>" >&2
  exit 2
}

restore_only=0
target=""
count=0
for arg in "$@"; do
  case "$arg" in
    --restore-only) restore_only=1 ;;
    -*) usage ;;
    *) target="$arg"; count=$(( count + 1 )) ;;
  esac
done
(( count == 1 )) || usage

if [[ ! -d "$target" ]]; then
  echo "Refusing: $target is not a directory." >&2
  exit 1
fi
WORKTREE="$(cd "$target" && pwd -P)"

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_TREE="$(cd "$(dirname "$COMMON_DIR")" && pwd -P)"

if [[ "$WORKTREE" == "$MAIN_TREE" ]]; then
  echo "Refusing: $WORKTREE is the main working tree." >&2
  exit 1
fi

listed=0
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      p="${line#worktree }"
      if [[ -d "$p" && "$(cd "$p" && pwd -P)" == "$WORKTREE" ]]; then listed=1; fi
      ;;
  esac
done < <(git -C "$MAIN_TREE" worktree list --porcelain)
if (( listed == 0 )); then
  echo "Refusing: $WORKTREE is not listed in 'git worktree list'." >&2
  exit 1
fi

# --- Restore: unlink shared-dir symlinks, bring back a replaced tracked .claude ---
relink=()
for d in "${SHARED_DIRS[@]}"; do
  dst="$WORKTREE/$d"
  [[ -L "$dst" ]] || continue
  unlink "$dst"
  echo "Unlinked $d"
  # Only a dir we just unlinked is restored from HEAD: a real tracked dir may
  # hold someone's uncommitted edits, and `checkout --` would discard them.
  if [[ -n "$(git -C "$WORKTREE" ls-tree -d HEAD -- "$d")" ]]; then
    git -C "$WORKTREE" checkout -- "$d"
    echo "Restored $d from HEAD"
    relink+=("rm -r \"$WORKTREE/$d\" && ln -s \"$MAIN_TREE/$d\" \"$WORKTREE/$d\"")
  else
    relink+=("ln -s \"$MAIN_TREE/$d\" \"$WORKTREE/$d\"")
  fi
done

if (( restore_only )); then
  if (( ${#relink[@]} )); then
    echo ""
    echo "Run these after the rebase to link the shared dirs back:"
    printf '  %s\n' "${relink[@]}"
  fi
  exit 0
fi

# --- Refuse a dirty worktree ---
status="$(git -C "$WORKTREE" status --porcelain)"
if [[ -n "$status" ]]; then
  echo "Worktree is not clean; nothing was removed:" >&2
  echo "$status" >&2
  echo "Commit or discard these yourself, then run this again." >&2
  echo "(The shared dirs above are already unlinked; that is fine to leave.)" >&2
  exit 1
fi

# --- Remove, then reap (the reaper finds orphans by the absence of the checkout) ---
git -C "$MAIN_TREE" worktree remove "$WORKTREE"
echo "Removed $WORKTREE"

if ! reap_out="$(cd "$MAIN_TREE" && node scripts/test-db/reap-branches.mjs 2>&1)"; then
  echo "$reap_out" >&2
  echo "The worktree is already gone; re-run the reap by hand from $MAIN_TREE:" >&2
  echo "  node scripts/test-db/reap-branches.mjs" >&2
  exit 1
fi
echo "$reap_out"
