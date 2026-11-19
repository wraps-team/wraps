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
# Run one read-only SQL statement against production. Never prints the URL.
# Usage: scripts/db-prod-query.sh "<sql>"
set -euo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 \"<sql>\"" >&2; exit 2; }
URL="$(env -u OP_SERVICE_ACCOUNT_TOKEN op read op://Wraps/web-production/DATABASE_URL)"
case "$URL" in *ep-damp-heart*) ;; *) echo "ERROR: URL is not the production endpoint" >&2; exit 1 ;; esac
printf 'begin transaction read only;\nset local statement_timeout = 30000;\n%s;\nrollback;\n' "$1" \
  | psql "$URL" -X -q -P pager=off -v ON_ERROR_STOP=1
