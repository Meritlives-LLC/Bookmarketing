#!/bin/sh
set -e

# Applies any pending migrations before the API starts. Safe to run on every
# container start/restart: prisma migrate deploy only applies migrations that
# haven't been applied yet and is a no-op otherwise.
echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec "$@"