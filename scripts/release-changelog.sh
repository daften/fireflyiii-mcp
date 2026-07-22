#!/usr/bin/env bash
# Write an automated security-release section into CHANGELOG.md and maintain
# the link references at the bottom of the file.
#
# Usage: release-changelog.sh <new-version> <summary>
#   <summary> may be multi-line (a squash-merge commit message); only its
#   first line becomes the changelog bullet.
#
# Entries already sitting under [Unreleased] intentionally fall inside the
# new section: they are shipping in this release, so that is where they
# belong.
set -euo pipefail

VERSION="$1"
BULLET=$(printf '%s\n' "$2" | head -n 1)
DATE=$(date -u +%Y-%m-%d)
REPO="https://github.com/daften/fireflyiii-mcp"

grep -q '^## \[Unreleased\]$' CHANGELOG.md || {
  echo "CHANGELOG.md has no '## [Unreleased]' section" >&2; exit 1;
}

# Previous release = first versioned section header currently in the file.
PREV=$(grep -m1 -oE '^## \[[0-9][^]]*\]' CHANGELOG.md | sed 's/^## \[//; s/\]$//')

awk -v ver="$VERSION" -v date="$DATE" -v bullet="$BULLET" '
  { print }
  /^## \[Unreleased\]$/ {
    print ""
    print "## [" ver "] - " date
    print ""
    print "### Security"
    print ""
    print "- " bullet " (automated security release)"
  }
' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md

# Retarget [Unreleased] and add the new compare link directly below it.
awk -v ver="$VERSION" -v prev="$PREV" -v repo="$REPO" '
  /^\[Unreleased\]: / {
    print "[Unreleased]: " repo "/compare/v" ver "...HEAD"
    print "[" ver "]: " repo "/compare/v" prev "...v" ver
    next
  }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
