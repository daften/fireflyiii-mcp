#!/usr/bin/env bash
# Creates a Firefly III test user and emits a Personal Access Token to stdout.
# Requires the fireflyiii-ci container to be running (docker-compose.ci.yml).
#
# The production Firefly III image does not include laravel/tinker, so we:
#   1. Create the Passport personal access client via artisan.
#   2. Bootstrap Laravel directly via PHP stdin to create the user and token.
set -euo pipefail

CONTAINER=fireflyiii-ci
FIREFLY_URL=${1:-http://localhost:8080}

# Wait for the /healthcheck endpoint (up to 6 minutes).
echo "Waiting for Firefly III at $FIREFLY_URL …" >&2
for i in $(seq 1 72); do
  if curl -sf "$FIREFLY_URL/healthcheck" > /dev/null 2>&1; then
    echo "Ready after $((i * 5))s" >&2
    break
  fi
  if [ "$i" -eq 72 ]; then
    echo "Timed out waiting for Firefly III" >&2
    exit 1
  fi
  sleep 5
done

# Create the Passport personal access client (idempotent if already exists).
docker exec "$CONTAINER" php artisan passport:client \
  --personal --name="CI Token Client" --no-interaction >&2

# Create a test user and PAT by bootstrapping Laravel directly via PHP stdin.
# FireflyIII uses the FireflyIII\User model (not App\Models\User).
RAW=$(docker exec -i "$CONTAINER" php 2>&1 <<'PHPEOF'
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
)

TOKEN=$(echo "$RAW" | grep -o 'TOKEN:.*' | sed 's/TOKEN://')

if [ -z "$TOKEN" ]; then
  echo "Failed to extract token from PHP output:" >&2
  echo "$RAW" >&2
  exit 1
fi

# Mask the token in Actions logs before printing.
echo "::add-mask::$TOKEN"
echo "$TOKEN"
