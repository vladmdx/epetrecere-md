#!/usr/bin/env bash
#
# Cloud Agent start: per-boot reconciliation.
#
# The database files are created once in .cursor/install.sh and captured in the
# environment snapshot. Each boot only needs to (re)start the daemon, so this
# is fast, idempotent, and returns promptly (it does not stay in foreground).
set -euo pipefail

PGDATA="$HOME/pgdata"
PGSOCK="$HOME/pgsock"

if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  echo "PostgreSQL not installed; run .cursor/install.sh first" >&2
  exit 1
fi
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"

mkdir -p "$PGSOCK"

if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "PostgreSQL already running"
else
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -w start
fi

# Confirm readiness before returning so dependents can connect immediately.
for _ in $(seq 1 30); do
  "$PGBIN/pg_isready" -h "$PGSOCK" -q && { echo "PostgreSQL ready"; exit 0; }
  sleep 1
done

echo "PostgreSQL did not become ready in time" >&2
exit 1
