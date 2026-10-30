import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { duplicateHeadings } from '../../scripts/changelog-guard.mjs';
import {
  addSecurityBullets,
  advisoriesByPackage,
  describeChanges,
  lockVersions,
  planUpdates,
  securityBullets,
  summaryMarkdown,
} from '../../scripts/audit-remediate.mjs';

const script = fileURLToPath(new URL('../../scripts/audit-remediate.mjs', import.meta.url));
// A real `npm audit --omit=dev --json` taken from this repository's package-lock.json on 2026-10-29,
// before the hand-made hotfixes #152 and #155. Six vulnerable packages, 9 advisories.
const realAudit = readFileSync(new URL('./fixtures/npm-audit-vulnerable.json', import.meta.url), 'utf8');

const clean = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } });

const advisory = (id, severity, title = `${id} title`) => ({
  source: 1,
  name: 'x',
  title,
  url: `https://github.com/advisories/${id}`,
  severity,
});
const audit = (vulnerabilities) => JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: {} });

test('plan on the real audit finds the six packages that were fixed by hand', () => {
  const { update, blocked } = planUpdates(realAudit);
  assert.deepEqual(update, ['@hono/node-server', 'body-parser', 'fast-uri', 'ip-address', 'qs', 'zod']);
  assert.deepEqual(blocked, []);
});

test('the default view is moderate and above; `all` also shows the low advisories of a listed package', () => {
  const gated = advisoriesByPackage(realAudit).get('fast-uri');
  const everything = advisoriesByPackage(realAudit, { all: true }).get('fast-uri');
  assert.deepEqual(gated.map((a) => a.severity), ['moderate', 'moderate']);
  assert.equal(everything.length, 4);
  assert.deepEqual(everything.map((a) => a.severity).sort(), ['low', 'low', 'moderate', 'moderate']);
  assert.match(everything[0].id, /^GHSA-/);
});

test('a package with only low advisories is neither listed nor updated', () => {
  const lowOnly = audit({ foo: { severity: 'low', isDirect: false, via: [advisory('GHSA-aaaa-bbbb-cccc', 'low')], fixAvailable: true } });
  assert.equal(advisoriesByPackage(lowOnly).size, 0);
  assert.deepEqual(planUpdates(lowOnly).update, []);
});

test('a string in `via` only links to another vulnerable package; it is never updated for its own sake', () => {
  const chain = audit({
    child: { severity: 'high', isDirect: false, via: [advisory('GHSA-1111-2222-3333', 'high')], fixAvailable: true },
    parent: { severity: 'high', isDirect: true, via: ['child'], fixAvailable: true },
  });
  assert.deepEqual(planUpdates(chain).update, ['child']);
});

test('fixAvailable as an object: a non-major fix updates the named package, a major one is refused', () => {
  const objects = audit({
    nested: {
      severity: 'moderate',
      isDirect: false,
      via: [advisory('GHSA-1111-2222-3333', 'moderate')],
      fixAvailable: { name: 'parent-pkg', version: '2.1.0', isSemVerMajor: false },
    },
    breaking: {
      severity: 'high',
      isDirect: false,
      via: [advisory('GHSA-4444-5555-6666', 'high')],
      fixAvailable: { name: 'framework', version: '9.0.0', isSemVerMajor: true },
    },
    unfixed: { severity: 'moderate', isDirect: false, via: [advisory('GHSA-7777-8888-9999', 'moderate')], fixAvailable: false },
  });
  const { update, blocked } = planUpdates(objects);
  assert.deepEqual(update, ['parent-pkg']);
  assert.deepEqual(blocked.map((b) => b.name).sort(), ['breaking', 'unfixed']);
  assert.match(blocked.find((b) => b.name === 'breaking').reason, /major update of framework to 9\.0\.0/);
  assert.match(blocked.find((b) => b.name === 'unfixed').reason, /no patched version/);
});

test('a failed `npm audit` (registry unreachable) is an error, never an all-clear', () => {
  assert.throws(() => planUpdates(JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'request failed' } })), /npm audit failed: request failed/);
  // npm leaves `summary` empty for a network failure; the message must still say what happened.
  assert.throws(() => planUpdates(JSON.stringify({ error: { code: 'ENOAUDIT', summary: '', detail: 'x' } })), /npm audit failed: ENOAUDIT/);
  // The exact object npm printed when the registry was unreachable (checked against a real run).
  assert.throws(() => planUpdates(JSON.stringify({ error: { summary: '', detail: '' } })), /npm audit failed: npm gave no detail \(usually the registry was unreachable\)/);
  assert.throws(() => planUpdates('{"hello":"world"}'), /Not an npm audit report/);
  assert.deepEqual(planUpdates(clean), { update: [], blocked: [] });
});

const lock = (packages) => JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'root' }, ...packages } });

test('lockVersions reads nested copies, ignores dev-only entries and de-duplicates', () => {
  const versions = lockVersions(
    lock({
      'node_modules/qs': { version: '6.16.0' },
      'node_modules/express/node_modules/qs': { version: '6.15.0' },
      'node_modules/tool/node_modules/qs': { version: '6.16.0' },
      'node_modules/vitest': { version: '5.0.0', dev: true },
      'node_modules/@scope/pkg': { version: '1.0.0' },
    }),
  );
  assert.deepEqual(versions.get('qs'), ['6.15.0', '6.16.0']);
  assert.deepEqual(versions.get('@scope/pkg'), ['1.0.0']);
  assert.equal(versions.has('vitest'), false);
});

test('describeChanges and securityBullets report direct vs transitive, all versions and every advisory', () => {
  const before = lock({
    'node_modules/zod': { version: '4.5.4' },
    'node_modules/fast-uri': { version: '3.1.8' },
    'node_modules/body-parser': { version: '2.3.0' },
    'node_modules/qs': { version: '6.16.0' },
    'node_modules/express/node_modules/qs': { version: '6.15.0' },
  });
  const after = lock({
    'node_modules/zod': { version: '4.6.7' },
    'node_modules/fast-uri': { version: '3.1.9' },
    'node_modules/body-parser': { version: '2.3.0' }, // not actually changed: must be left out
    'node_modules/qs': { version: '6.17.1' },
    'node_modules/express/node_modules/qs': { version: '6.17.1' },
  });
  const changes = describeChanges(realAudit, before, after);
  assert.deepEqual(changes.map((c) => c.name).sort(), ['fast-uri', 'qs', 'zod']);

  const bullets = securityBullets(changes);
  const byName = (name) => bullets.find((b) => b.includes(`\`${name}\``));
  assert.match(byName('zod'), /^- Bumped direct dependency `zod` 4\.5\.4 to 4\.6\.7 \(\[GHSA-mrhx-c7xc-m3w5\]\(https:\/\/github\.com\/advisories\/GHSA-mrhx-c7xc-m3w5\); high\): /);
  assert.match(byName('qs'), /^- Bumped transitive `qs` 6\.15\.0, 6\.16\.0 to 6\.17\.1 \(/);
  // fast-uri has two moderate and two low advisories: all four are cited, labelled with the highest.
  const fastUri = byName('fast-uri');
  assert.equal((fastUri.match(/GHSA-[0-9a-z-]+\]\(/g) || []).length, 4);
  assert.match(fastUri, /; moderate\): /);
  for (const bullet of bullets) {
    assert.match(bullet, /Lockfile only \(automated audit fix\)\.$/);
    assert.equal(bullet.includes('\n'), false);
  }
});

test('an update that did not change an audited package yields no bullets', () => {
  const same = lock({ 'node_modules/zod': { version: '4.5.4' } });
  assert.deepEqual(describeChanges(realAudit, same, same), []);
});

const changelog = (unreleased) => `# Changelog

## [Unreleased]
${unreleased}
## [0.5.5] - 2026-10-21

### Security

- shipped

[Unreleased]: https://example.com/compare/v0.5.5...HEAD
`;

test('adds a Security subsection when [Unreleased] has none, with a blank line before the next release', () => {
  const result = addSecurityBullets(changelog(''), ['- one', '- two']);
  assert.equal(result, changelog('\n### Security\n\n- one\n- two\n'));
});

test('adds the Security subsection after existing subsections', () => {
  const result = addSecurityBullets(changelog('\n### Added\n\n- a feature\n'), ['- one']);
  assert.equal(result, changelog('\n### Added\n\n- a feature\n\n### Security\n\n- one\n'));
});

test('appends to an existing Security subsection and not to the one after it', () => {
  const input = changelog('\n### Security\n\n- earlier\n- also earlier\n\n### Fixed\n\n- a fix\n');
  const result = addSecurityBullets(input, ['- new']);
  assert.equal(result, changelog('\n### Security\n\n- earlier\n- also earlier\n- new\n\n### Fixed\n\n- a fix\n'));
});

test('appends after nested bullets of the last entry', () => {
  const input = changelog('\n### Security\n\n- **Bumped things**:\n  - `zod` a to b\n');
  assert.match(addSecurityBullets(input, ['- new']), /  - `zod` a to b\n- new\n\n## \[0\.5\.5\]/);
});

test('never creates a second Security heading, so the changelog guard stays satisfied', () => {
  for (const unreleased of ['', '\n### Security\n\n- a\n', '\n### Added\n\n- x\n\n### Security\n\n- a\n']) {
    const result = addSecurityBullets(changelog(unreleased), ['- new']);
    assert.deepEqual(duplicateHeadings(result, new Set(['0.5.5'])), [], JSON.stringify(unreleased));
  }
});

test('no bullets leaves the text alone; a changelog without [Unreleased] is an error', () => {
  const text = changelog('');
  assert.equal(addSecurityBullets(text, []), text);
  assert.throws(() => addSecurityBullets('# Changelog\n\n## [0.5.5] - 2026-10-21\n', ['- x']), /no "## \[Unreleased\]"/);
});

test('the PR summary lists what changed and what the audit still reports', () => {
  const before = lock({ 'node_modules/zod': { version: '4.5.4' }, 'node_modules/qs': { version: '6.16.0' } });
  const after = lock({ 'node_modules/zod': { version: '4.6.7' }, 'node_modules/qs': { version: '6.16.0' } });
  const stillBad = audit({
    qs: { severity: 'moderate', isDirect: false, via: [advisory('GHSA-6pq8-jhm2-2vcw', 'moderate')], fixAvailable: false },
  });
  const text = summaryMarkdown(realAudit, stillBad, before, after);
  assert.match(text, /- `zod` 4\.5\.4 to 4\.6\.7: \[GHSA-mrhx-c7xc-m3w5\]/);
  assert.match(text, /### Still reported by `npm audit --omit=dev`/);
  assert.match(text, /- `qs`: \[GHSA-6pq8-jhm2-2vcw\].*Not fixed here: no patched version is available yet\./);
  assert.match(summaryMarkdown(realAudit, clean, before, after), /_None\. The strict nightly audit should pass/);
});

test('the CLI: plan lists packages, changelog edits the file in place, bad input exits 1 with an annotation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-remediate-'));
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: dir });
    const auditPath = join(dir, 'audit.json');
    const beforeLock = join(dir, 'before.json');
    const afterLock = join(dir, 'after.json');
    const changelogPath = join(dir, 'CHANGELOG.md');
    writeFileSync(auditPath, realAudit);
    writeFileSync(beforeLock, lock({ 'node_modules/zod': { version: '4.5.4' } }));
    writeFileSync(afterLock, lock({ 'node_modules/zod': { version: '4.6.7' } }));
    writeFileSync(changelogPath, changelog(''));

    const plan = run('plan', auditPath);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(plan.stdout, '@hono/node-server\nbody-parser\nfast-uri\nip-address\nqs\nzod\n');

    const edit = run('changelog', auditPath, beforeLock, afterLock, changelogPath);
    assert.equal(edit.status, 0, edit.stderr);
    assert.match(readFileSync(changelogPath, 'utf8'), /### Security\n\n- Bumped direct dependency `zod` 4\.5\.4 to 4\.6\.7/);

    // An update that touches no audited package leaves the file alone.
    const untouched = readFileSync(changelogPath, 'utf8');
    const noop = run('changelog', auditPath, afterLock, afterLock, changelogPath);
    assert.equal(noop.status, 0, noop.stderr);
    assert.match(noop.stdout, /CHANGELOG\.md left alone/);
    assert.equal(readFileSync(changelogPath, 'utf8'), untouched);

    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ error: { summary: 'offline' } }));
    const failed = run('plan', bad);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /^::error::npm audit failed: offline/);
    assert.equal(run('bogus').status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
