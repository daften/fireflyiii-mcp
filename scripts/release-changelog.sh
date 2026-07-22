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

# Previous release = first versioned section header currently in the file.
PREV=$(grep -m1 -oE '^## \[[0-9][^]]*\]' CHANGELOG.md | sed 's/^## \[//; s/\]$//' || echo "")
if [ -z "$PREV" ]; then
  echo "CHANGELOG.md has no versioned '## [X.Y.Z]' section" >&2
  exit 1
fi

# Insert under [Unreleased] when the header exists (its pending entries then
# fall inside the new section — they ship with this release). After a manual
# release the header is typically consumed, so fall back to inserting before
# the first versioned section header.
if grep -q '^## \[Unreleased\]$' CHANGELOG.md; then MODE=after; else MODE=before; fi

awk -v ver="$VERSION" -v date="$DATE" -v bullet="$BULLET" -v mode="$MODE" '
  function section() {
    print "## [" ver "] - " date
    print ""
    print "### Security"
    print ""
    print "- " bullet " (automated security release)"
  }
  mode == "after" && /^## \[Unreleased\]$/ { print; print ""; section(); next }
  mode == "before" && !done && /^## \[/ { section(); print ""; done = 1 }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md

# Retarget [Unreleased] and add the new compare link directly below it; if the
# link block has no [Unreleased] line, append both links at the end instead.
awk -v ver="$VERSION" -v prev="$PREV" -v repo="$REPO" '
  /^\[Unreleased\]: / {
    print "[Unreleased]: " repo "/compare/v" ver "...HEAD"
    print "[" ver "]: " repo "/compare/v" prev "...v" ver
    next
  }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
if ! grep -q "^\[${VERSION}\]: " CHANGELOG.md; then
  {
    echo "[Unreleased]: ${REPO}/compare/v${VERSION}...HEAD"
    echo "[${VERSION}]: ${REPO}/compare/v${PREV}...v${VERSION}"
  } >> CHANGELOG.md
fi
