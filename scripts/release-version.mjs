#!/usr/bin/env node
/**
 * Version classification for the release workflows.
 *
 * `publish.yml` and `auto-release.yml` used to assume every version is a plain `X.Y.Z`: a `v*` tag
 * always published to npm `latest`, the nightly version came from `split('.').map(Number)` (which
 * turns `1.0.0-alpha.1` into `1.0.NaN`), and `npm version patch` on a prerelease silently produces
 * the stable release. This module is the one place that decides what a version means, so the
 * workflows share the decision and the tests can exercise it.
 *
 *   node scripts/release-version.mjs classify <version>       -> prerelease=<bool> / npm_tag=<tag>
 *   node scripts/release-version.mjs nightly-base <version>   -> X.Y.Z the nightly version builds on
 *   node scripts/release-version.mjs assert-stable <version>  -> exit 1 for a prerelease
 */
import { pathToFileURL } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// `latest` is what a plain install resolves and `nightly` belongs to the nightly channel; a
// prerelease named after either would publish over it.
const RESERVED_NPM_TAGS = new Set(['latest', 'nightly']);

function parse(version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`'${version}' is not a valid version (expected X.Y.Z or X.Y.Z-prerelease).`);
  }
  const [, major, minor, patch, prerelease] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: prerelease ?? null };
}

/**
 * Release-channel facts for a version being tagged. A stable version publishes to `latest`; a
 * prerelease publishes under the dist-tag named by its leading identifier (`1.0.0-alpha.1` and
 * `1.0.0-alpha1` both -> `alpha`; a purely numeric one -> `next`) and never to `latest`.
 */
export function classify(version) {
  const { prerelease } = parse(version);
  if (prerelease === null) return { prerelease: false, npmTag: 'latest' };
  const lead = /^[A-Za-z][A-Za-z-]*/.exec(prerelease);
  const npmTag = lead ? lead[0] : 'next';
  if (RESERVED_NPM_TAGS.has(npmTag)) {
    throw new Error(`The prerelease identifier '${npmTag}' in '${version}' is reserved; pick another (alpha, beta, rc).`);
  }
  return { prerelease: true, npmTag };
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
  if (classify(version).prerelease) {
    throw new Error(
      `package.json is at the prerelease ${version}. Automated security releases bump the patch ` +
        'version, which for a prerelease means publishing the stable release by accident. Cut this ' +
        'release by hand (AGENTS.md, "Releasing a New Version").',
    );
  }
}

function main(argv) {
  const [command, version] = argv;
  try {
    if (!version) throw new Error(`usage: release-version.mjs <classify|nightly-base|assert-stable> <version>`);
    if (command === 'classify') {
      const { prerelease, npmTag } = classify(version);
      console.log(`prerelease=${prerelease}`);
      console.log(`npm_tag=${npmTag}`);
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
