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
# Print the production DATABASE_URL for use in analysis or tooling.
# Usage: eval "$(scripts/db-prod-url.sh)"  — exports DATABASE_URL into current shell
# Or:    scripts/db-prod-url.sh            — prints export statement for inspection
set -euo pipefail

ENV_FILE="apps/web/.env.production.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Ensure you have the production env file." >&2
  exit 1
fi

LINE=$(grep "^DATABASE_URL=" "$ENV_FILE" | head -1)
if [[ -z "$LINE" ]]; then
  echo "ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

# Extract value after DATABASE_URL=, stripping optional surrounding quotes
URL="${LINE#DATABASE_URL=}"
URL="${URL#\"}"
URL="${URL%\"}"
URL="${URL#\'}"
URL="${URL%\'}"

echo "export DATABASE_URL='$URL'"
