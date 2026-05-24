#!/usr/bin/env bash
# Creates a Firefly III test user and emits a Personal Access Token to stdout.
# Requires the fireflyiii-ci container to be running (docker-compose.ci.yml).
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

# Create a test user and PAT via artisan tinker.
# Output is prefixed with TOKEN: so we can strip any Tinker noise.
# Handles both Passport (->accessToken) and Sanctum (->plainTextToken) token APIs.
RAW=$(docker exec "$CONTAINER" php artisan tinker --execute="
\$user = new \App\Models\User([
    'email'    => 'ci@localhost.test',
    'password' => Hash::make('ci-password-unused'),
    'blocked'  => false,
]);
\$user->save();
try { \$user->assignRole('owner'); } catch (\Throwable \$e) {}
\$token = \$user->createToken('CI Integration Test');
echo 'TOKEN:' . (\$token->plainTextToken ?? \$token->accessToken ?? '');
" 2>&1)

TOKEN=$(echo "$RAW" | grep -o 'TOKEN:.*' | sed 's/TOKEN://')

if [ -z "$TOKEN" ]; then
  echo "Failed to extract token from tinker output:" >&2
  echo "$RAW" >&2
  exit 1
fi

# Mask the token in Actions logs before printing.
echo "::add-mask::$TOKEN"
echo "$TOKEN"
