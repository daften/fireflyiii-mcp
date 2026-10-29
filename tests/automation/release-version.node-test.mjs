import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertStable, classify, isNewest, isPrerelease, nightlyBase } from '../../scripts/release-version.mjs';

const script = fileURLToPath(new URL('../../scripts/release-version.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('a stable version publishes to latest', () => {
  assert.deepEqual(classify('0.5.6'), { prerelease: false, npmTag: 'latest' });
  assert.deepEqual(classify('1.0.0'), { prerelease: false, npmTag: 'latest' });
});

test('alpha, beta and rc prereleases all publish to next, never latest', () => {
  for (const version of ['1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-rc.10', '0.6.0-alpha.0']) {
    assert.deepEqual(classify(version), { prerelease: true, npmTag: 'next' }, version);
  }
});

test('the prerelease vocabulary is closed: only alpha.N, beta.N and rc.N', () => {
  const refused = [
    '1.0.0-alpha', // no number
    '1.0.0-alpha1', // number glued to the stage; sorts alpha10 < alpha2
    '1.0.0-beta', '1.0.0-rc',
    '1.0.0-foo.1', '1.0.0-next.1', '1.0.0-latest.1', '1.0.0-nightly.1', '1.0.0-dev.1', '1.0.0-canary.1',
    '1.0.0-Alpha.1', '1.0.0-RC.1', // case matters: the sort order depends on it
    '1.0.0-1', // purely numeric
    '1.0.0-alpha.01', // leading zero is not valid semver for a numeric identifier
    '1.0.0-alpha.1.2', '1.0.0-alpha.x', '1.0.0-alpha.1-hotfix',
  ];
  for (const version of refused) {
    assert.throws(() => classify(version), /not allowed/, version);
  }
});

test('alpha < beta < rc < stable by semver precedence, so the stages need no special handling', async () => {
  const { compareVersions } = await import('../../scripts/changelog-guard.mjs');
  const ascending = ['1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta.1', '1.0.0-rc.1', '1.0.0-rc.2', '1.0.0'];
  for (let i = 1; i < ascending.length; i += 1) {
    assert.ok(compareVersions(ascending[i], ascending[i - 1]) > 0, `${ascending[i]} > ${ascending[i - 1]}`);
  }
});

test('anything that is not X.Y.Z[-prerelease] is rejected', () => {
  for (const bad of ['', 'v1.0.0', '1.0', '1.0.0.0', '1.0.0-', '1.0.0+build', '1.0.0-alpha..1', 'latest', '1.0.0; rm -rf /']) {
    assert.throws(() => classify(bad), /not a valid version/, JSON.stringify(bad));
  }
});

test('isNewest: next only ever moves forward', () => {
  const tags = ['v0.5.4', 'v0.5.5', 'v1.0.0-alpha.1', 'v1.0.0-beta.1'];
  assert.equal(isNewest('1.0.0-rc.1', tags), true);
  assert.equal(isNewest('1.0.0-beta.2', tags), true);
  assert.equal(isNewest('1.0.0', tags), true); // stable release newer than its own prereleases
  assert.equal(isNewest('0.6.0', tags), false); // older than the alpha line already tagged
  assert.equal(isNewest('0.5.7', tags), false); // hotfix must not pull next back from 1.0.0-beta.1
  assert.equal(isNewest('1.0.0-alpha.0', tags), false);
});

test('isNewest: the tag being released does not count against itself, and non-version tags are ignored', () => {
  assert.equal(isNewest('1.0.0-alpha.1', ['v0.5.5', 'v1.0.0-alpha.1']), true);
  assert.equal(isNewest('1.0.0', ['v1.0.0-rc.1', 'v1.0.0', 'nightly', 'v', 'vfoo', 'latest']), true);
  assert.equal(isNewest('0.5.6', []), true); // first release ever
  assert.equal(isNewest('1.0.0', ['v1.0.1']), false);
});

test('isNewest: after a stable 1.0.0, a stable 1.0.1 and a new prerelease line both move next', () => {
  const tags = ['v0.5.5', 'v1.0.0-rc.1', 'v1.0.0'];
  assert.equal(isNewest('1.0.1', tags), true);
  assert.equal(isNewest('1.1.0-alpha.1', tags), true);
  assert.equal(isNewest('1.0.0-rc.2', tags), false); // older than the stable it leads up to
});

test('nightly versions build on the next patch of a stable version and the core of a prerelease', () => {
  assert.equal(nightlyBase('0.5.5'), '0.5.6');
  assert.equal(nightlyBase('1.0.9'), '1.0.10');
  assert.equal(nightlyBase('1.0.0-alpha.1'), '1.0.0');
  // The regression this guards: Number('0-alpha1') is NaN and produced 1.0.NaN-nightly.<stamp>.
  assert.doesNotMatch(nightlyBase('1.0.0-alpha.1'), /NaN/);
});

test('automated security releases refuse to run over any prerelease', () => {
  assert.doesNotThrow(() => assertStable('0.5.5'));
  assert.throws(() => assertStable('1.0.0-alpha.1'), /prerelease/);
  // Also a prerelease the release policy would not publish: it is still not a stable version.
  assert.throws(() => assertStable('1.0.0-foo.1'), /prerelease/);
  assert.equal(isPrerelease('1.0.0-foo.1'), true);
  assert.equal(isPrerelease('1.0.0'), false);
});

test('the CLI prints GITHUB_OUTPUT lines and fails with an annotation on bad input', () => {
  const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run('classify', '1.0.0-alpha.1'), 'prerelease=true\nnpm_tag=next\n');
  assert.equal(run('classify', '0.5.6'), 'prerelease=false\nnpm_tag=latest\n');
  assert.equal(run('nightly-base', '0.5.5'), '0.5.6\n');
  assert.equal(run('is-newest', '1.0.0', 'v0.5.5', 'v1.0.0-rc.1', 'v1.0.0'), 'true\n');
  assert.equal(run('is-newest', '0.5.7', 'v0.5.5', 'v1.0.0-rc.1'), 'false\n');

  const bad = cli('classify', '1.0.0-foo.1');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^::error::/);
  assert.equal(cli('classify', 'not-a-version').status, 1);
  assert.equal(cli('assert-stable', '1.0.0-alpha.1').status, 1);
  assert.equal(cli('assert-stable', '0.5.5').status, 0);
  assert.equal(cli('classify').status, 1);
  assert.equal(cli('bogus', '1.0.0').status, 1);
});
