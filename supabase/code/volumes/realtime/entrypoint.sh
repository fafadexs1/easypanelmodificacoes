#!/bin/bash
set -euo pipefail

# Realtime tenant DB connections auto-detect IP version and may pick IPv6 first.
# Resolve DB_HOST to an IPv4 literal to avoid :enetunreach on IPv6-misconfigured hosts.
if [ -n "${DB_HOST:-}" ]; then
  resolved_db_host=""

  if command -v getent >/dev/null 2>&1; then
    resolved_db_host="$(getent ahostsv4 "${DB_HOST}" 2>/dev/null | awk 'NR==1 {print $1}')"
  fi

  if [ -n "${resolved_db_host}" ]; then
    echo "Resolved DB_HOST ${DB_HOST} -> ${resolved_db_host}"
    export DB_HOST="${resolved_db_host}"
  else
    echo "Unable to resolve IPv4 for DB_HOST=${DB_HOST}; using original value"
  fi
fi

if [ "$#" -eq 0 ]; then
  set -- /app/bin/server
fi

exec /app/run.sh "$@"
