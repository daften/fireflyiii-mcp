import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baselineTag,
  changedReleasedSections,
  check,
  duplicateHeadings,
  duplicateSections,
  hasDatedSections,
  parseSections,
  run,
} from '../../scripts/changelog-guard.mjs';

// The baseline every scenario compares against: one shipped release, one open [Unreleased].
const baseline = `# Changelog

## [Unreleased]

### Fixed

- Feature C

## [0.5.0] - 2026-09-12

### Added

- Feature A
- Feature B

## [0.4.0] - 2026-08-01

### Added

- Older thing

[0.5.0]: https://example.com/compare/v0.4.0...v0.5.0
`;

test('parses sections and drops the trailing link-reference block', () => {
  const sections = parseSections(baseline);
  assert.deepEqual(sections.map((s) => s.version), ['Unreleased', '0.5.0', '0.4.0']);
  // The link definitions must not land in the oldest section, or adding one during a release
  // would read as an edit to a shipped section.
  assert.doesNotMatch(sections.at(-1).body, /example\.com/);
  assert.deepEqual(sections[1].headings, ['Added']);
});

test('accepts a changelog that only gained [Unreleased] entries', () => {
  const current = baseline.replace('- Feature C', '- Feature C\n- Feature D');
  assert.deepEqual(check(baseline, current), []);
});

test('accepts a newly cut release section', () => {
  const current = baseline.replace(
    '## [Unreleased]\n\n### Fixed\n\n- Feature C\n',
    '## [Unreleased]\n\n## [0.6.0] - 2026-10-01\n\n### Fixed\n\n- Feature C\n',
  );
  assert.deepEqual(check(baseline, current), []);
});

// Shape 2, reproduced from the real back-merge: the release branch moves entries into the dated
// section while develop adds one to [Unreleased]; union concatenates and the pending entry is
// absorbed into the release that already shipped.
test('rejects a back-merge that absorbs an [Unreleased] entry into the shipped release', () => {
  const current = baseline
    .replace('## [Unreleased]\n\n### Fixed\n\n- Feature C\n', '## [Unreleased]\n')
    .replace('- Feature B', '- Feature B\n- Feature C');

  const problems = check(baseline, current);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\[0\.5\.0\].*was modified/s);
  assert.match(problems[0], /back-merge absorbing/);
});

// Shape 1, reproduced from PRs #21 and #23: a stale branch replays its changelog snapshot and the
// bullets land inside an already-published section.
test('rejects a stale branch splicing bullets into a published section', () => {
  const current = baseline.replace('- Older thing', '- Older thing\n- Something from a three-month-old branch');
  const problems = check(baseline, current);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\[0\.4\.0\].*was modified/s);
});

test('rejects a removed release section', () => {
  const current = baseline.replace('## [0.4.0] - 2026-08-01\n\n### Added\n\n- Older thing\n', '');
  assert.match(check(baseline, current).join('\n'), /has been removed/);
});

// Shape 3, reproduced from #81's merge.
test('rejects duplicate headings in [Unreleased] but tolerates them in shipped sections', () => {
  const withDuplicate = baseline.replace(
    '### Fixed\n\n- Feature C',
    '### Fixed\n\n- Feature C\n\n### Fixed\n\n- Feature C2',
  );
  assert.match(check(baseline, withDuplicate).join('\n'), /more than one "### Fixed"/);

  // A published section that already carries a duplicate is history: the immutability rule forbids
  // editing it, so the guard must not demand a fix it also rejects. (0.4.6 really is like this.)
  const shippedDuplicate = baseline.replace(
    '### Added\n\n- Feature A\n- Feature B',
    '### Added\n\n- Feature A\n\n### Added\n\n- Feature B',
  );
  assert.deepEqual(check(shippedDuplicate, shippedDuplicate), []);
});

test('unreleased-only duplicates are found without a baseline', () => {
  assert.equal(duplicateHeadings(baseline).length, 0);
  assert.equal(changedReleasedSections(baseline, baseline).length, 0);
});

test('baselineTag picks the newest tag and copes with none', () => {
  const exec = (tags, onHead = '') => (args) => (args[1] === '--points-at' ? onHead : tags);
  assert.equal(baselineTag(exec('v0.5.0\nv0.4.0\n')), 'v0.5.0');
  assert.equal(baselineTag(exec('')), null);
});

// Regression: publish.yml's verify job checks out the very tag being released, so the newest tag is
// HEAD. Comparing against it compares the file to itself — the guard passed unconditionally at the
// one moment it was billed as the last gate before npm and GHCR.
test('baselineTag skips tags on HEAD so the publish-time run is not self-referential', () => {
  const exec = (args) => (args[1] === '--points-at' ? 'v0.6.0\n' : 'v0.6.0\nv0.5.0\nv0.4.0\n');
  assert.equal(baselineTag(exec), 'v0.5.0');
});

test('a freshly cut release is still checked for duplicate headings at publish time', () => {
  const shipped = `# Changelog\n\n## [Unreleased]\n\n## [0.5.0] - 2026-09-12\n\n### Added\n\n- A\n`;
  const cut = `# Changelog\n\n## [Unreleased]\n\n## [0.6.0] - 2026-10-01\n\n### Fixed\n\n- one\n\n### Fixed\n\n- two\n\n## [0.5.0] - 2026-09-12\n\n### Added\n\n- A\n`;
  const exec = (args) => {
    if (args[1] === '--points-at') return 'v0.6.0\n';
    if (args[0] === 'tag') return 'v0.6.0\nv0.5.0\n';
    return shipped;
  };
  assert.throws(() => run({}, exec, () => cut), /found 1 problem/);
});

// Regression: the version -> section Map keeps only the last block, so a corrupted first copy beside
// a clean second one used to compare equal and pass.
test('rejects a whole section replayed twice, even when the last copy is clean', () => {
  const twice = baseline.replace(
    '## [0.4.0] - 2026-08-01\n\n### Added\n\n- Older thing\n',
    '## [0.4.0] - 2026-08-01\n\n### Added\n\n- Older thing\n- spliced\n\n## [0.4.0] - 2026-08-01\n\n### Added\n\n- Older thing\n',
  );
  assert.match(check(baseline, twice).join('\n'), /appears more than once/);
  assert.equal(duplicateSections(baseline).length, 0);
});

// Regression: stripping every `[x]: y` line wherever it appeared made one invisible to the
// immutability comparison, so a merge could splice one into a published section undetected.
test('only the trailing link-reference block is ignored', () => {
  const spliced = baseline.replace('- Older thing', '- Older thing\n[hidden]: spliced by a bad merge');
  assert.match(check(baseline, spliced).join('\n'), /\[0\.4\.0\].*was modified/s);

  // The real trailing block still must not count as section content.
  const extraLink = baseline.replace(
    '[0.5.0]: https://example.com/compare/v0.4.0...v0.5.0',
    '[0.6.0]: https://example.com/compare/v0.5.0...v0.6.0\n[0.5.0]: https://example.com/compare/v0.4.0...v0.5.0',
  );
  assert.deepEqual(check(baseline, extraLink), []);
});

// A changelog listing shipped versions with no tags in sight means the checkout lost its tags;
// passing there would be a guard that silently does nothing.
test('fails loudly when tags are missing but releases are claimed', () => {
  assert.equal(hasDatedSections('# Changelog\n\n## [Unreleased]\n'), false);
  assert.equal(hasDatedSections(baseline), true);

  const noTags = () => '';
  assert.throws(() => run({}, noTags, () => baseline), /no v\* tag is visible/);
  // A genuinely new repo still passes.
  assert.doesNotThrow(() => run({}, noTags, () => '# Changelog\n\n## [Unreleased]\n'));
});

test('run() honours the skip flag without touching git', () => {
  const exploding = () => {
    throw new Error('git should not have been called');
  };
  run({ CHANGELOG_GUARD_SKIP: 'true' }, exploding, () => baseline);
});

test('run() compares against the newest tag and names the offending section', () => {
  const corrupted = baseline.replace('- Older thing', '- Older thing\n- spliced by a stale branch');
  const calls = [];
  const exec = (args) => {
    calls.push(args.join(' '));
    if (args[1] === '--points-at') return '';
    if (args[0] === 'tag') return 'v0.5.0\nv0.4.0\n';
    if (args[0] === 'show') return baseline;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };

  assert.throws(() => run({}, exec, () => corrupted), /found 1 problem\(s\) against v0\.5\.0/);
  // Baseline comes from the tag that published the section, not from the base branch's current file.
  assert.deepEqual(calls, [
    'tag --points-at HEAD',
    'tag --list v* --sort=-v:refname',
    'show v0.5.0:CHANGELOG.md',
  ]);

  // And it passes on a clean file, so the throw above is the corruption and not the plumbing.
  assert.doesNotThrow(() => run({}, exec, () => baseline));
});
