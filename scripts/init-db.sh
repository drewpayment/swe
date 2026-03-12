#!/bin/bash
set -e

echo "Running database migrations..."

for f in /migrations/*.sql; do
    echo "Applying: $f"
    psql "$DATABASE_URL" -f "$f"
done

echo "Migrations complete."
