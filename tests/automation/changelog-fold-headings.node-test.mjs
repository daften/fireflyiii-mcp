import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { duplicateHeadings } from '../../scripts/changelog-guard.mjs';
import { foldDuplicateHeadings } from '../../scripts/changelog-fold-headings.mjs';

const script = fileURLToPath(new URL('../../scripts/changelog-fold-headings.mjs', import.meta.url));

// The shape that actually occurred (a hotfix on main meeting develop's own Security section):
// merge=union keeps both sides, so the heading appears twice with no blank line between.
const incident = `# Changelog

## [Unreleased]

### Added

- a feature

### Security

- develop-side hardening
### Security

- hotfix: bumped zod

## [0.5.5] - 2026-10-21

### Security

- shipped

[Unreleased]: https://example.com/compare/v0.5.5...HEAD
[0.5.5]: https://example.com/compare/v0.5.4...v0.5.5
`;

const expected = `# Changelog

## [Unreleased]

### Added

- a feature

### Security

- develop-side hardening
- hotfix: bumped zod

## [0.5.5] - 2026-10-21

### Security

- shipped

[Unreleased]: https://example.com/compare/v0.5.5...HEAD
[0.5.5]: https://example.com/compare/v0.5.4...v0.5.5
`;

test('folds the duplicate Security heading from a back-merge into one, keeping both sides in order', () => {
  const { text, folded } = foldDuplicateHeadings(incident);
  assert.deepEqual(folded, ['Security']);
  assert.equal(text, expected);
});

test('the folded changelog passes the guard rule that rejected the original', () => {
  const released = new Set(['0.5.5']);
  assert.equal(duplicateHeadings(incident, released).length, 1);
  assert.deepEqual(duplicateHeadings(foldDuplicateHeadings(incident).text, released), []);
});

test('is idempotent, and returns a clean file byte for byte', () => {
  const once = foldDuplicateHeadings(incident).text;
  const twice = foldDuplicateHeadings(once);
  assert.equal(twice.text, once);
  assert.deepEqual(twice.folded, []);
  assert.equal(foldDuplicateHeadings(expected).text, expected);
});

test('keeps nested and multi-line bullets intact', () => {
  const input = `## [Unreleased]

### Security

- **Bumped things**, resolving:
  - \`zod\` 4.5.4 to 4.6.7
  - \`qs\` 6.16.0 to 6.17.0
### Security

- second
  continued on a second line

## [1.0.0] - 2026-01-01
`;
  const { text } = foldDuplicateHeadings(input);
  assert.match(text, /- \*\*Bumped things\*\*, resolving:\n  - `zod` 4\.5\.4 to 4\.6\.7\n  - `qs` 6\.16\.0 to 6\.17\.0\n- second\n  continued on a second line\n\n## \[1\.0\.0\]/);
  assert.equal((text.match(/^### Security$/gm) || []).length, 1);
});

test('folds three copies and keeps each heading at its first position', () => {
  const input = `## [Unreleased]

### Fixed

- f1

### Security

- s1

### Fixed

- f2
### Security

- s2

### Fixed

- f3

## [1.0.0] - 2026-01-01
`;
  const { text, folded } = foldDuplicateHeadings(input);
  assert.deepEqual(folded, ['Fixed', 'Security']);
  assert.equal(
    text,
    `## [Unreleased]

### Fixed

- f1
- f2
- f3

### Security

- s1
- s2

## [1.0.0] - 2026-01-01
`,
  );
});

test('leaves shipped sections alone, even ones that already contain duplicate headings', () => {
  const input = `## [Unreleased]

### Added

- x

## [0.4.6] - 2026-09-11

### Security

- one

### Security

- two
`;
  const { text, folded } = foldDuplicateHeadings(input);
  assert.deepEqual(folded, []);
  assert.equal(text, input);
});

test('keeps text between the [Unreleased] heading and the first subsection', () => {
  const input = `## [Unreleased]

Pending notes for the next release.

### Security

- a
### Security

- b

## [1.0.0] - 2026-01-01
`;
  const { text } = foldDuplicateHeadings(input);
  assert.match(text, /^## \[Unreleased\]\n\nPending notes for the next release\.\n\n### Security\n\n- a\n- b\n\n## \[1\.0\.0\]/);
});

test('an empty [Unreleased] or a file without one is returned unchanged', () => {
  assert.deepEqual(foldDuplicateHeadings('## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n'), {
    text: '## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n',
    folded: [],
  });
  assert.deepEqual(foldDuplicateHeadings('# Changelog\n\n## [1.0.0] - 2026-01-01\n'), {
    text: '# Changelog\n\n## [1.0.0] - 2026-01-01\n',
    folded: [],
  });
});

test('[Unreleased] at the end of the file (no later section) is folded too', () => {
  const input = '## [Unreleased]\n\n### Security\n\n- a\n### Security\n\n- b\n';
  assert.equal(foldDuplicateHeadings(input).text, '## [Unreleased]\n\n### Security\n\n- a\n- b\n');
});

test('the CLI rewrites the file in place and a second run is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fold-test-'));
  try {
    const file = join(dir, 'CHANGELOG.md');
    writeFileSync(file, incident);
    const first = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /folded duplicate \[Unreleased\] headings: Security/);
    assert.equal(readFileSync(file, 'utf8'), expected);

    const second = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /nothing to do/);
    assert.equal(readFileSync(file, 'utf8'), expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
