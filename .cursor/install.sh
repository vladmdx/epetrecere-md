#!/usr/bin/env bash
#
# Cloud Agent install: idempotent repository bootstrap.
#
# Prepares everything durable: Node dependencies, a local PostgreSQL cluster
# (with SSL, because src/lib/db always connects with ssl:'require'), the
# database schema, seed data, and a .env.local with local defaults. The
# per-boot job of starting the database daemon lives in .cursor/start.sh.
#
# Safe to run repeatedly: the cluster, database, schema push and seed are all
# guarded so a second run converges instead of duplicating state.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PGDATA="$HOME/pgdata"
PGSOCK="$HOME/pgsock"
DB_NAME="epetrecere"
DB_URL="postgres://ubuntu@localhost:5432/${DB_NAME}?sslmode=require"

echo "==> Installing Node dependencies"
# npm ci installs exactly what package-lock.json pins and never rewrites it,
# keeping the environment reproducible. Falls back to npm install if the
# lockfile and package.json ever drift.
npm ci || npm install

echo "==> Ensuring PostgreSQL is installed"
if ! ls /usr/lib/postgresql/*/bin/initdb >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib openssl
fi
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
echo "    using $PGBIN"

mkdir -p "$PGSOCK"

echo "==> Initializing PostgreSQL cluster (idempotent)"
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$PGBIN/initdb" -D "$PGDATA" -U ubuntu \
    --auth-local=trust --auth-host=trust -E UTF8
  # Self-signed cert: the app connects with ssl:'require', which uses TLS but
  # does not verify the CA, so a self-signed cert is sufficient for local dev.
  openssl req -new -x509 -days 3650 -nodes -text \
    -out "$PGDATA/server.crt" -keyout "$PGDATA/server.key" \
    -subj "/CN=localhost"
  chmod 600 "$PGDATA/server.key" "$PGDATA/server.crt"
  cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = 'localhost'
port = 5432
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
unix_socket_directories = '$PGSOCK'
EOF
  cat > "$PGDATA/pg_hba.conf" <<EOF
local   all all              trust
hostssl all all 127.0.0.1/32 trust
hostssl all all ::1/128      trust
host    all all 127.0.0.1/32 trust
EOF
else
  echo "    cluster already initialized"
fi

echo "==> Starting PostgreSQL (temporarily, for schema + seed)"
if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -w start
fi
for _ in $(seq 1 30); do
  "$PGBIN/pg_isready" -h "$PGSOCK" -q && break
  sleep 1
done

echo "==> Creating database (idempotent)"
if ! "$PGBIN/psql" -h "$PGSOCK" -U ubuntu -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  "$PGBIN/psql" -h "$PGSOCK" -U ubuntu -d postgres -c "CREATE DATABASE ${DB_NAME};"
else
  echo "    database ${DB_NAME} already exists"
fi

echo "==> Writing .env.local (only if missing)"
# Placeholder Clerk keys let the public site and the production build boot.
# Real Clerk keys added as Cursor Secrets are injected as env vars, which
# Next.js prefers over .env.local, so authenticated flows light up without
# editing this file. The publishable key below decodes to clerk.example.com$.
if [ ! -f .env.local ]; then
  cat > .env.local <<EOF
DATABASE_URL="${DB_URL}"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_Y2xlcmsuZXhhbXBsZS5jb20k"
CLERK_SECRET_KEY="sk_test_0000000000000000000000000000000000000000000000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENABLE_TEST_LOGIN="1"
EOF
else
  echo "    .env.local already present, leaving it untouched"
fi

export DATABASE_URL="$DB_URL"

echo "==> Applying database schema (drizzle-kit push)"
npx drizzle-kit push

echo "==> Seeding database (only if empty)"
CATS="$("$PGBIN/psql" "$DB_URL" -tAc "SELECT count(*) FROM categories" 2>/dev/null || echo 0)"
if [ "${CATS:-0}" = "0" ]; then
  npx tsx .cursor/seed-local.ts
else
  echo "    already seeded (${CATS} categories)"
fi

# The @epetrecere/shared workspace exports its TypeScript source directly
# (package "main" points at ./src/index.ts), so the web app consumes it
# without a separate build step.

echo "==> Install complete"
