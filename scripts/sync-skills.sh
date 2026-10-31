#!/bin/sh
# Runs under zsh when it is installed, otherwise bash; the body is written for
# both. Re-exec happens before `set -euo pipefail`, which plain sh lacks.
if [ -z "${ZSH_VERSION:-}" ]; then
  if command -v zsh >/dev/null 2>&1; then exec zsh "$0" "$@"; fi
  # Not bash at all: re-exec into bash. Bash run as sh: just turn posix off.
  case "${BASH_VERSION:-}" in
    "") exec bash "$0" "$@" ;;
    *) set +o posix ;;
  esac
fi
# Sync SKILL.md files from the skills repo into website public dir
# Usage: ./scripts/sync-skills.sh [skills-repo-path]

set -euo pipefail

SKILLS_SRC="${1:-../skills/skills}"
DEST="apps/website/public/.well-known/skills"

if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "error: skills source not found at $SKILLS_SRC"
  echo "usage: $0 [path-to-skills/skills]"
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"

# An empty source dir must yield zero iterations, not a literal "*/".
if [[ -n "${ZSH_VERSION:-}" ]]; then setopt null_glob; else shopt -s nullglob; fi

count=0
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_dir="${skill_dir%/}"
  name="${skill_dir##*/}"
  if [[ -f "$skill_dir/SKILL.md" ]]; then
    mkdir -p "$DEST/$name"
    cp "$skill_dir/SKILL.md" "$DEST/$name/SKILL.md"
    (( ++count ))
  fi
done

echo "synced $count skills to $DEST"
