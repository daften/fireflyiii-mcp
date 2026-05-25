#!/usr/bin/env bash
# Creates a Firefly III test user and emits a Personal Access Token to stdout.
# Requires the fireflyiii-ci container to be running (docker-compose.ci.yml).
#
# The production Firefly III image does not include laravel/tinker, so we:
#   1. Wait for HTTP healthcheck, then wait for DB migrations to finish.
#   2. Create the Passport personal access client via artisan.
#   3. Copy a PHP bootstrap script into the container and execute it.
set -euo pipefail

CONTAINER=fireflyiii-ci
FIREFLY_URL=${1:-http://localhost:8080}

# Wait for the /healthcheck endpoint (up to 6 minutes).
echo "Waiting for Firefly III HTTP at $FIREFLY_URL …" >&2
for i in $(seq 1 72); do
  if curl -sf "$FIREFLY_URL/healthcheck" > /dev/null 2>&1; then
    echo "HTTP ready after $((i * 5))s" >&2
    break
  fi
  if [ "$i" -eq 72 ]; then
    echo "Timed out waiting for Firefly III HTTP" >&2
    exit 1
  fi
  sleep 5
done

# Wait for database migrations to complete.
# The /healthcheck endpoint returns 200 as soon as PHP-FPM starts, before
# migrations have finished — artisan commands that touch the DB will fail
# until migrate:status exits 0.
echo "Waiting for database migrations …" >&2
for i in $(seq 1 36); do
  if docker exec "$CONTAINER" php artisan migrate:status > /dev/null 2>&1; then
    echo "Migrations ready after $((i * 5))s" >&2
    break
  fi
  if [ "$i" -eq 36 ]; then
    echo "Timed out waiting for migrations" >&2
    docker exec "$CONTAINER" php artisan migrate:status >&2 || true
    exit 1
  fi
  sleep 5
done

# Create the Passport personal access client.
echo "Creating Passport personal access client …" >&2
docker exec "$CONTAINER" php artisan passport:client \
  --personal --name="CI Token Client" --no-interaction

# Write a PHP bootstrap script to a temp file on the host, copy it into the
# container, execute it, then remove it.  Avoids docker exec -i stdin issues.
# FireflyIII uses FireflyIII\User (not App\Models\User).
PHP_TMP=$(mktemp /tmp/ci-create-user.XXXXXX.php)
chmod 644 "$PHP_TMP"
cat > "$PHP_TMP" <<'PHPEOF'
<?php
require '/var/www/html/vendor/autoload.php';
$app = require_once '/var/www/html/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
use FireflyIII\User;
use Illuminate\Support\Facades\Hash;
$user = new User([
    'email'    => 'ci@localhost.test',
    'password' => Hash::make('ci-password-unused'),
    'blocked'  => false,
]);
$user->save();
try { $user->assignRole('owner'); } catch (Throwable $e) {}
$token = $user->createToken('CI Integration Test');
echo 'TOKEN:' . ($token->plainTextToken ?? $token->accessToken ?? '');
PHPEOF

docker cp "$PHP_TMP" "$CONTAINER:/tmp/ci-create-user.php"
rm -f "$PHP_TMP"

RAW=$(docker exec "$CONTAINER" php /tmp/ci-create-user.php 2>&1)
docker exec "$CONTAINER" rm -f /tmp/ci-create-user.php 2>/dev/null || true

TOKEN=$(echo "$RAW" | grep -o 'TOKEN:.*' | sed 's/TOKEN://')

if [ -z "$TOKEN" ]; then
  echo "Failed to extract token from PHP output:" >&2
  echo "$RAW" >&2
  exit 1
fi

# Mask the token in Actions logs before printing.
echo "::add-mask::$TOKEN"
echo "$TOKEN"
