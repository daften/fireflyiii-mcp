import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchAlerts, matchingAlerts, parseDependencies, run } from '../../scripts/security-pr-alerts.mjs';

const dependency = { dependencyName: '@vitest/mocker', prevVersion: '4.1.10', directory: '/', packageEcosystem: 'npm_and_yarn' };
const alert = {
  state: 'OPEN', vulnerableRequirements: '4.1.10',
  vulnerableManifestFilename: 'package-lock.json', vulnerableManifestPath: 'package-lock.json',
  securityVulnerability: { package: { name: '@vitest/mocker', ecosystem: 'NPM' } },
};

test('matches bare and equals-prefixed versions returned by GitHub', () => {
  for (const vulnerableRequirements of ['4.1.10', '= 4.1.10', '=4.1.10']) {
    assert.equal(matchingAlerts([dependency], [{ ...alert, vulnerableRequirements }]).length, 1);
  }
});

test('checks all dependencies in a group and nested manifest paths', () => {
  const nested = { ...dependency, directory: '/packages/app/' };
  const nestedAlert = { ...alert, vulnerableManifestPath: 'packages/app/package-lock.json' };
  assert.equal(matchingAlerts([{ ...dependency, dependencyName: 'unrelated' }, nested], [nestedAlert]).length, 1);
});

test('does not match unrelated, unknown-version or wrong-path alerts', () => {
  for (const changed of [
    { state: 'UNKNOWN' }, { vulnerableRequirements: '4.1.9' },
    { vulnerableRequirements: '< 4.1.11' }, { vulnerableManifestPath: 'other/package-lock.json' },
    { securityVulnerability: { package: { name: 'other', ecosystem: 'NPM' } } },
    { securityVulnerability: { package: { name: '@vitest/mocker', ecosystem: 'PIP' } } },
  ]) assert.equal(matchingAlerts([dependency], [{ ...alert, ...changed }]).length, 0);
  assert.equal(matchingAlerts([{ ...dependency, prevVersion: '' }], [alert]).length, 0);
  assert.throws(() => matchingAlerts([], [alert]), /metadata/);
});

const response = (nodes, hasNextPage = false, endCursor = null) => ({
  ok: true, json: async () => ({ data: { repository: { vulnerabilityAlerts: {
    nodes, pageInfo: { hasNextPage, endCursor },
  } } } }),
});

test('paginates beyond the first 100 alerts', async () => {
  const cursors = [];
  const alerts = await fetchAlerts('owner/repo', 'test-token', async (_url, options) => {
    cursors.push(JSON.parse(options.body).variables.cursor);
    return cursors.length === 1 ? response(Array(100).fill({ ...alert, vulnerableRequirements: '4.1.9' }), true, 'next') : response([alert]);
  });
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(matchingAlerts([dependency], alerts).length, 1);
});

test('reports API failures separately from a successful empty response', async () => {
  await assert.rejects(fetchAlerts('o/r', ''), /missing/);
  await assert.rejects(fetchAlerts('o/r', 'token', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(fetchAlerts('o/r', 'token', async () => ({ ok: true, json: async () => ({ errors: [{}] }) })), /GraphQL/);
  await assert.rejects(fetchAlerts('o/r', 'token', async () => ({ ok: true, json: async () => ({ data: {} }) })), /unexpected/);
  await assert.rejects(fetchAlerts('o/r', 'token', async () => response([], true)), /cursor/);
  assert.deepEqual(await fetchAlerts('o/r', 'token', async () => response([])), []);
});


test('writes the merge gate only after a successful lookup, with a distinct no-match error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'security-alerts-test-'));
  try {
    const env = { DEPENDENCIES_JSON: JSON.stringify([dependency]), GITHUB_REPOSITORY: 'o/r', GH_TOKEN: 'test', GITHUB_OUTPUT: join(dir, 'matched'), DEPENDENCY_GROUP: 'security-fixes' };
    await run(env, async () => response([alert]));
    assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8'), 'security=true\n');
    await assert.rejects(run(env, async () => response([])), /lookup succeeded but no advisory matched/);
    await run({ ...env, GITHUB_OUTPUT: join(dir, 'unmatched'), DEPENDENCY_GROUP: '' }, async () => response([]));
    assert.equal(readFileSync(join(dir, 'unmatched'), 'utf8'), 'security=false\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('preserves the existing workflow treatment of fixed and dismissed alerts', () => {
  for (const state of ['OPEN', 'FIXED', 'DISMISSED']) {
    assert.equal(matchingAlerts([dependency], [{ ...alert, state }]).length, 1);
  }
});

test('reports missing dependency metadata as such, without calling the alert API', async () => {
  for (const raw of [undefined, '', '   ']) {
    assert.throws(() => parseDependencies(raw), /metadata is missing/);
  }
  assert.throws(() => parseDependencies('not json'), /not valid JSON/);

  // The bad-metadata error must arrive before any request, so a real security PR fails with a
  // diagnosis rather than a SyntaxError after dozens of GraphQL pages.
  let called = false;
  const request = async () => {
    called = true;
    throw new Error('alert API should not have been called');
  };
  await assert.rejects(run({ DEPENDENCIES_JSON: undefined }, request), /metadata is missing/);
  await assert.rejects(run({ DEPENDENCIES_JSON: '[]' }, request), /metadata is missing/);
  assert.equal(called, false);
});
