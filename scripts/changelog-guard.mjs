#!/usr/bin/env node
// Catches the ways CHANGELOG.md's `merge=union` driver corrupts the file silently.
//
// Union merge resolves conflicting hunks by keeping both sides. That is what makes back-merges
// painless, but it concatenates *lines*, with no idea which release section a bullet belongs to.
// Three failure shapes have been observed, all reported by git as a clean merge:
//
//   1. A stale branch's changelog snapshot replays its bullets into an already-released section,
//      sometimes duplicating an entry that is already there.
//   2. A back-merge of a freshly-cut release absorbs develop's pending `[Unreleased]` entries into
//      the dated section that just shipped, and empties `[Unreleased]`. The release then claims
//      changes it never contained, and those entries never appear in any future release's notes.
//   3. Two branches adding the same `### Fixed` heading produce two of them in one section.
//
// Nothing downstream notices: backmerge.yml pushes straight to develop, its PR path only triggers
// on a conflict (which union suppresses), and publish.yml only checks that a section exists.
//
// This guard is detection, not prevention — by design. It turns all three into a red build.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const UNRELEASED = 'Unreleased';

/**
 * Split a changelog into its `## [...]` sections.
 *
 * Everything before the first section is the preamble, and the trailing link-reference block
 * (`[0.4.6]: https://...`) is stripped off the final section so that adding a new link definition
 * during a release does not read as an edit to the oldest release.
 */
export function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const header = /^## \[([^\]]+)\]/.exec(line);
    if (header) {
      current = { version: header[1], header: line, body: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (/^\[[^\]]+\]:\s/.test(line)) continue;
    current.body.push(line);
  }

  return sections.map((section) => ({
    version: section.version,
    header: section.header,
    body: section.body.join('\n').trim(),
    headings: section.body.filter((line) => line.startsWith('### ')).map((line) => line.slice(4).trim()),
  }));
}

/** A section's full text, for comparing a release against the tag that shipped it. */
const sectionText = (section) => `${section.header}\n${section.body}`;

/**
 * Released sections are immutable. Once `## [X.Y.Z] - date` is tagged and published, its content is
 * a historical record: the GitHub Release body was extracted from it and the docs site renders it.
 * Any later change to one is either a union misfiling (shapes 1 and 2 above) or a deliberate edit
 * that wants an explicit skip.
 */
export function changedReleasedSections(baselineText, currentText) {
  const current = new Map(parseSections(currentText).map((s) => [s.version, s]));
  const problems = [];

  for (const base of parseSections(baselineText)) {
    if (base.version === UNRELEASED) continue;
    const now = current.get(base.version);
    if (!now) {
      problems.push(`Released section "${base.header.trim()}" has been removed.`);
      continue;
    }
    if (sectionText(now) !== sectionText(base)) {
      problems.push(
        `Released section "${base.header.trim()}" was modified. Released sections are immutable — ` +
          'this is almost always the merge=union driver splicing entries from a stale branch, or a ' +
          "back-merge absorbing [Unreleased] entries into the release that just shipped. Move them back " +
          'under [Unreleased].',
      );
    }
  }

  return problems;
}

/**
 * Two branches adding the same heading to one section leaves two of it (shape 3).
 *
 * Only sections that are still editable are checked — `[Unreleased]` and a release being cut for
 * the first time. An already-published section is frozen by the immutability rule above, so
 * flagging a duplicate heading there would demand a fix that the same guard forbids. 0.4.6 shipped
 * with two `### Security` headings and is staying that way.
 */
export function duplicateHeadings(text, released = new Set()) {
  const problems = [];
  for (const section of parseSections(text)) {
    if (released.has(section.version)) continue;
    const seen = new Set();
    for (const heading of section.headings) {
      if (seen.has(heading)) {
        problems.push(
          `Section "${section.header.trim()}" has more than one "### ${heading}" heading. ` +
            'Merge the bullets under a single heading.',
        );
      }
      seen.add(heading);
    }
  }
  return problems;
}

export function check(baselineText, currentText) {
  const released = new Set(
    parseSections(baselineText)
      .map((section) => section.version)
      .filter((version) => version !== UNRELEASED),
  );
  return [...changedReleasedSections(baselineText, currentText), ...duplicateHeadings(currentText, released)];
}

/** Newest `v*` tag by version order, or null when the repo has no releases yet. */
export function latestReleaseTag(run = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  const tags = run(['tag', '--list', 'v*', '--sort=-v:refname']).split('\n').filter(Boolean);
  return tags[0] ?? null;
}

export function run(
  env = process.env,
  exec = (args) => execFileSync('git', args, { encoding: 'utf8' }),
  readChangelog = () => readFileSync('CHANGELOG.md', 'utf8'),
) {
  if (env.CHANGELOG_GUARD_SKIP === 'true') {
    console.log('changelog-guard skipped ([skip changelog-guard]).');
    return;
  }

  const tag = latestReleaseTag(exec);
  if (!tag) {
    console.log('changelog-guard: no v* tag yet, nothing to compare against.');
    return;
  }

  // Released sections are compared against the tag that published them, so a section is checked
  // against what actually shipped rather than against whatever the base branch currently holds.
  const baseline = exec(['show', `${tag}:CHANGELOG.md`]);
  const problems = check(baseline, readChangelog());

  if (problems.length) {
    for (const problem of problems) console.error(`::error file=CHANGELOG.md::${problem}`);
    throw new Error(`changelog-guard found ${problems.length} problem(s) against ${tag}.`);
  }
  console.log(`changelog-guard: CHANGELOG.md is consistent with ${tag}.`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
