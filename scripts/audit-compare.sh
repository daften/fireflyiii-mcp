#!/usr/bin/env bash
# Compare two `npm audit --json` reports. Fail only if HEAD introduces
# moderate+ advisories that BASE does not already have — a PR that fixes
# some-but-not-all outstanding advisories must stay green (see the
# 2026-07-22 release-workflow design: concurrent Dependabot security PRs
# deadlocked the old absolute audit check).
#
# Usage: audit-compare.sh <base-audit.json> <head-audit.json>
set -euo pipefail

BASE_JSON="$1"
HEAD_JSON="$2"

# Advisory identity = the GHSA URL. `via` entries are objects for real
# advisories and plain strings for transitive chains; only objects count.
advisories() {
  jq -r '
    [.vulnerabilities[]?.via[]?
      | select(type == "object")
      | select(.severity == "moderate" or .severity == "high" or .severity == "critical")
      | .url]
    | unique | .[]' "$1" | sort -u
}

BASE_SET=$(advisories "$BASE_JSON")
HEAD_SET=$(advisories "$HEAD_JSON")

NEW=$(comm -13 <(printf '%s\n' "$BASE_SET") <(printf '%s\n' "$HEAD_SET") | sed '/^$/d')

if [ -n "$NEW" ]; then
  echo "::error::This change introduces moderate+ advisories not present on the base branch:"
  printf '%s\n' "$NEW"
  exit 1
fi

echo "OK: no new moderate+ advisories relative to base."
if [ -n "$HEAD_SET" ]; then
  echo "Pre-existing advisories (non-blocking here; the nightly strict audit tracks them):"
  printf '%s\n' "$HEAD_SET"
fi
