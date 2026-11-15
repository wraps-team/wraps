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
#   3. stops (exit 1, nothing removed) if the worktree is still dirty, or holds
#      ignored files under the paths where uncommitted work lives: `git worktree
#      remove` does not count ignored files as dirty and would delete them.
#      Those paths are .claude, plans, ai-notes, .agents, .cursor, .wraps,
#      .gstack and .mcp.json at ANY depth (the .gitignore patterns have no
#      leading slash), plus notes, docs/superpowers and packages/video at the
#      repo root;
#   4. runs `git worktree remove` (never --force). That deletes the rest of the
#      ignored files too (node_modules, .next, dist, .turbo, env files), which
#      is fine: a worktree always has them and they are regenerated;
#   5. runs scripts/test-db/reap-branches.mjs from the main tree, AFTER the
#      removal, so the orphaned wt-* Neon branch is reclaimed.
#
# --restore-only runs steps 1-2 only (to rebase in a worktree) and prints the
# commands that put the symlinks back afterwards.
#
# This script never runs rm, --force or stash itself.
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

# The main tree is the first entry of the worktree list, as setup-worktree.sh finds it.
MAIN_TREE=""
listed=0
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      p="${line#worktree }"
      [[ -d "$p" ]] || continue
      p="$(cd "$p" && pwd -P)"
      [[ -n "$MAIN_TREE" ]] || MAIN_TREE="$p"
      if [[ "$p" == "$WORKTREE" ]]; then listed=1; fi
      ;;
  esac
done < <(git worktree list --porcelain)

if [[ -n "$MAIN_TREE" && "$WORKTREE" == "$MAIN_TREE" ]]; then
  echo "Refusing: $WORKTREE is the main working tree." >&2
  exit 1
fi
if (( listed == 0 )); then
  echo "Refusing: $WORKTREE is not listed in 'git worktree list'." >&2
  exit 1
fi

# --- Restore: unlink shared-dir symlinks, bring back a replaced tracked .claude ---
relink=()
stamp="$(date +%s)"
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
    # Delete the restored copy only if it is still pristine (no ignored or
    # modified files in it); otherwise move it aside so nothing is lost. Every
    # printed line is safe to paste twice: it does nothing once the link exists,
    # and `ln -sn` never descends into an existing link.
    relink+=("[ -L \"$dst\" ] || { if [ -z \"\$(git -C \"$WORKTREE\" status --porcelain --ignored -- $d)\" ]; then rm -r \"$dst\"; else mv \"$dst\" \"$dst.restored.$stamp\"; fi && ln -sn \"$MAIN_TREE/$d\" \"$dst\"; }")
  else
    relink+=("[ -e \"$dst\" ] || [ -L \"$dst\" ] || ln -sn \"$MAIN_TREE/$d\" \"$dst\"")
  fi
done

print_relink() {
  if (( ${#relink[@]} )); then
    echo ""
    echo "$1"
    printf '  %s\n' "${relink[@]}"
  fi
}

if (( restore_only )); then
  print_relink "Run these after the rebase to link the shared dirs back:"
  exit 0
fi

# --- Refuse a dirty worktree, or one holding ignored work ---
status="$(git -C "$WORKTREE" status --porcelain)"
if [[ -n "$status" ]]; then
  echo "Worktree is not clean; nothing was removed:" >&2
  echo "$status" >&2
  echo "Commit or discard these yourself, then run this again." >&2
  print_relink "The shared dirs were unlinked. To link them back if you keep working here:" >&2
  exit 1
fi

# `git worktree remove` ignores gitignored files and deletes them. Refuse when
# any sit under the paths where uncommitted work lives; build output is fine.
# -z: NUL-terminated, unquoted paths (the default output C-quotes names with
# spaces or non-ASCII bytes, which no pattern below would match).
# --ignored=matching: lists each ignored path by its own name. The default
# collapses an untracked directory holding only ignored files into the
# directory itself (`!! tools/`), hiding a nested `tools/plans/`.
ignored=()
skip=0
while IFS= read -r -d '' rec; do
  if (( skip )); then skip=0; continue; fi
  # A rename/copy record is followed by its source path as a second record.
  case "${rec:0:2}" in R?|C?|?R|?C) skip=1 ;; esac
  [[ "$rec" == "!! "* ]] || continue
  entry="${rec#!! }"
  # "/$entry" lets a pattern anchor at any depth with a leading */.
  case "/$entry" in
    */.claude|*/.claude/*|*/plans|*/plans/*|*/ai-notes|*/ai-notes/*|\
    */.agents|*/.agents/*|*/.cursor|*/.cursor/*|*/.wraps|*/.wraps/*|\
    */.gstack|*/.gstack/*|*/.mcp.json|\
    /notes|/notes/*|/docs/superpowers|/docs/superpowers/*|\
    /packages/video|/packages/video/*)
      [[ -L "$WORKTREE/${entry%/}" ]] || ignored+=("$entry")
      ;;
  esac
done < <(git -C "$WORKTREE" status --porcelain --ignored=matching -z)
if (( ${#ignored[@]} )); then
  echo "Worktree holds ignored files that removal would delete; nothing was removed:" >&2
  printf '  %s\n' "${ignored[@]}" >&2
  echo "Move them out of the worktree (or delete them yourself), then run this again." >&2
  print_relink "The shared dirs were unlinked. To link them back if you keep working here:" >&2
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
