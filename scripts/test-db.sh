#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies supabase/migrations as a
# non-superuser, and runs the database security tests against it.
# Requires Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH or in PG_BIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
PORT="${PGTEST_PORT:-54329}"
DATA="$(mktemp -d)"
PGUSER_RUN=""
if [ "$(id -u)" = "0" ]; then
  # initdb refuses to run as root; use a throwaway system user.
  id pgtest >/dev/null 2>&1 || useradd -M -r pgtest
  chown -R pgtest "$DATA"
  PGUSER_RUN="runuser -u pgtest --"
fi

cleanup() { $PGUSER_RUN "$PG_BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

$PGUSER_RUN "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$PGUSER_RUN "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=localhost" -l "$DATA/log" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h localhost -p "$PORT" -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -U postgres -d postgres -c "create database app;"
"${PSQL[@]}" -U postgres -d app -f "$ROOT/supabase/tests/bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -U migrator -d app -f "$f"
done

export TEST_DATABASE_URL="postgres://postgres@localhost:$PORT/app"
cd "$ROOT"
npx vitest run --dir tests/db
