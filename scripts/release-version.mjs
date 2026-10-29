#!/usr/bin/env node
/**
 * Version policy for the release workflows.
 *
 * `publish.yml` and `auto-release.yml` used to assume every version is a plain `X.Y.Z`: a `v*` tag
 * always published to npm `latest`, the nightly version came from `split('.').map(Number)` (which
 * turns `1.0.0-alpha.1` into `1.0.NaN`), and `npm version patch` on a prerelease silently produces
 * the stable release. This module is the one place that decides what a version means, so the
 * workflows share the decision and the tests can exercise it.
 *
 * Release channels:
 *   - stable      `X.Y.Z`               npm `latest`, Docker `latest` + `X.Y.Z` + `X.Y` + `X`
 *   - prerelease  `X.Y.Z-(alpha|beta|rc).N`   npm `next`, Docker `X.Y.Z-pre.N` + `next`
 *   - `next` is "the newest tagged release of any kind": a prerelease moves it, and so does a stable
 *     release that is newer than everything already tagged, so it never trails `latest`.
 *   - nightly     built in CI from `develop`, never tagged, never goes through `classify`.
 *
 *   node scripts/release-version.mjs classify <version>            -> prerelease=<bool> / npm_tag=<tag>
 *   node scripts/release-version.mjs is-newest <version> [tag...]  -> true|false
 *   node scripts/release-version.mjs nightly-base <version>        -> X.Y.Z the nightly version builds on
 *   node scripts/release-version.mjs assert-stable <version>       -> exit 1 for a prerelease
 */
import { pathToFileURL } from 'node:url';
import { compareVersions } from './changelog-guard.mjs';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// Semver allows any prerelease identifier; the project does not. Three stages, each followed by a
// number with no leading zero. They sort in maturity order (alpha < beta < rc) under semver's
// lexical rule for alphanumeric identifiers, which is what makes the ordering work without help.
const PRERELEASE = /^(alpha|beta|rc)\.(0|[1-9][0-9]*)$/;

function parse(version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`'${version}' is not a valid version (expected X.Y.Z or X.Y.Z-prerelease).`);
  }
  const [, major, minor, patch, prerelease] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: prerelease ?? null };
}

/** True for any semver prerelease, including ones the release policy would refuse to publish. */
export function isPrerelease(version) {
  return parse(version).prerelease !== null;
}

/**
 * Release-channel facts for a version being tagged. A stable version publishes to `latest`. A
 * prerelease must be `alpha.N`, `beta.N` or `rc.N` and publishes to `next`, never `latest`.
 */
export function classify(version) {
  const { prerelease } = parse(version);
  if (prerelease === null) return { prerelease: false, npmTag: 'latest' };
  if (!PRERELEASE.test(prerelease)) {
    throw new Error(
      `The prerelease '${prerelease}' in '${version}' is not allowed. Use alpha.N, beta.N or rc.N ` +
        '(for example 1.0.0-alpha.1), so the stages sort in maturity order.',
    );
  }
  return { prerelease: true, npmTag: 'next' };
}

/**
 * True when `version` has higher semver precedence than every tag in `tags` (`vX.Y.Z[-pre]`; the
 * tag for `version` itself and anything that is not a version tag are ignored). The `next` channel
 * only ever moves forward, so a stable hotfix on an old line cannot pull it back from `1.0.0-rc.1`.
 */
export function isNewest(version, tags) {
  parse(version);
  return tags
    .map((tag) => tag.replace(/^v/, ''))
    .filter((other) => SEMVER.test(other) && other !== version)
    .every((other) => compareVersions(version, other) > 0);
}

/**
 * The `X.Y.Z` a nightly version (`<base>-nightly.<stamp>`) is built on. Stable `0.5.5` -> `0.5.6`,
 * the next patch. A prerelease `1.0.0-alpha.1` -> `1.0.0`: `1.0.0-nightly.<stamp>` sorts after
 * every `1.0.0-alpha.*` and before the `1.0.0` it leads up to, which is what a nightly of that
 * line should do.
 */
export function nightlyBase(version) {
  const { major, minor, patch, prerelease } = parse(version);
  return prerelease === null ? `${major}.${minor}.${patch + 1}` : `${major}.${minor}.${patch}`;
}

/** `npm version patch` on a prerelease yields the stable release, so automation must not run on one. */
export function assertStable(version) {
  if (isPrerelease(version)) {
    throw new Error(
      `package.json is at the prerelease ${version}. Automated security releases bump the patch ` +
        'version, which for a prerelease means publishing the stable release by accident. Cut this ' +
        'release by hand (AGENTS.md, "Releasing a New Version").',
    );
  }
}

function main(argv) {
  const [command, version, ...rest] = argv;
  try {
    if (!version) throw new Error('usage: release-version.mjs <classify|is-newest|nightly-base|assert-stable> <version> [tag...]');
    if (command === 'classify') {
      const { prerelease, npmTag } = classify(version);
      console.log(`prerelease=${prerelease}`);
      console.log(`npm_tag=${npmTag}`);
    } else if (command === 'is-newest') {
      console.log(String(isNewest(version, rest)));
    } else if (command === 'nightly-base') {
      console.log(nightlyBase(version));
    } else if (command === 'assert-stable') {
      assertStable(version);
    } else {
      throw new Error(`unknown command '${command}'`);
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
