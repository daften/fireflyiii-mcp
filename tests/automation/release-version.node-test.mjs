import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertStable, classify, nightlyBase } from '../../scripts/release-version.mjs';

const script = fileURLToPath(new URL('../../scripts/release-version.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('a stable version publishes to latest', () => {
  assert.deepEqual(classify('0.5.6'), { prerelease: false, npmTag: 'latest' });
  assert.deepEqual(classify('1.0.0'), { prerelease: false, npmTag: 'latest' });
});

test('a prerelease publishes under its leading identifier and never to latest', () => {
  assert.deepEqual(classify('1.0.0-alpha.1'), { prerelease: true, npmTag: 'alpha' });
  assert.deepEqual(classify('1.0.0-alpha1'), { prerelease: true, npmTag: 'alpha' });
  assert.deepEqual(classify('1.0.0-beta.3'), { prerelease: true, npmTag: 'beta' });
  assert.deepEqual(classify('1.0.0-rc.1'), { prerelease: true, npmTag: 'rc' });
  assert.deepEqual(classify('1.0.0-1'), { prerelease: true, npmTag: 'next' });
});

test('a prerelease may not borrow a reserved dist-tag', () => {
  assert.throws(() => classify('1.0.0-latest.1'), /reserved/);
  assert.throws(() => classify('1.0.0-nightly.1'), /reserved/);
});

test('anything that is not X.Y.Z[-prerelease] is rejected', () => {
  for (const bad of ['', 'v1.0.0', '1.0', '1.0.0.0', '1.0.0-', '1.0.0+build', '1.0.0-alpha..1', 'latest', '1.0.0; rm -rf /']) {
    assert.throws(() => classify(bad), /not a valid version/, JSON.stringify(bad));
  }
});

test('nightly versions build on the next patch of a stable version and the core of a prerelease', () => {
  assert.equal(nightlyBase('0.5.5'), '0.5.6');
  assert.equal(nightlyBase('1.0.9'), '1.0.10');
  assert.equal(nightlyBase('1.0.0-alpha.1'), '1.0.0');
  assert.equal(nightlyBase('1.0.0-alpha1'), '1.0.0');
  // The regression this guards: Number('0-alpha1') is NaN and produced 1.0.NaN-nightly.<stamp>.
  assert.doesNotMatch(nightlyBase('1.0.0-alpha1'), /NaN/);
});

test('automated security releases refuse to run over a prerelease', () => {
  assert.doesNotThrow(() => assertStable('0.5.5'));
  assert.throws(() => assertStable('1.0.0-alpha.1'), /prerelease/);
});

test('the CLI prints GITHUB_OUTPUT lines and fails with an annotation on bad input', () => {
  assert.equal(execFileSync(process.execPath, [script, 'classify', '1.0.0-alpha.1'], { encoding: 'utf8' }), 'prerelease=true\nnpm_tag=alpha\n');
  assert.equal(execFileSync(process.execPath, [script, 'classify', '0.5.6'], { encoding: 'utf8' }), 'prerelease=false\nnpm_tag=latest\n');
  assert.equal(execFileSync(process.execPath, [script, 'nightly-base', '0.5.5'], { encoding: 'utf8' }), '0.5.6\n');

  const bad = cli('classify', 'not-a-version');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^::error::/);
  assert.equal(cli('assert-stable', '1.0.0-alpha.1').status, 1);
  assert.equal(cli('assert-stable', '0.5.5').status, 0);
  assert.equal(cli('classify').status, 1);
  assert.equal(cli('bogus', '1.0.0').status, 1);
});
