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
 * Drop the trailing link-reference block (`[0.4.6]: https://...`, `[Unreleased]: ...`).
 *
 * Two things keep this narrow. It scans from the end, so a definition elsewhere in the file is not
 * touched; and it only recognises *version-shaped* labels, so a line that merely looks like a link
 * definition — which a merge could splice in right above the real block, where a shape-only match
 * would swallow it — stays in the section body and trips the immutability check. Releases add a
 * definition here for the new version, which is the only reason this block is excluded at all.
 */
const LINK_DEFINITION = /^\[(?:Unreleased|\d+\.\d+\.\d+)\]:\s/;

function stripTrailingLinkBlock(lines) {
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    if (line.trim() === '' || LINK_DEFINITION.test(line)) {
      end -= 1;
      continue;
    }
    break;
  }
  return lines.slice(0, end);
}

/**
 * Split a changelog into its `## [...]` sections.
 *
 * Everything before the first section is the preamble, and the trailing link-reference block
 * (`[0.4.6]: https://...`) is stripped off the final section so that adding a new link definition
 * during a release does not read as an edit to the oldest release.
 */
export function parseSections(text) {
  const lines = stripTrailingLinkBlock(text.split('\n'));
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
 * Two `## [X.Y.Z]` blocks for one version — a stale branch's snapshot replayed as a whole section
 * rather than a bullet. Checked separately because the version→section Map below keeps only the
 * last block, so a corrupted first copy sitting beside a clean second one would compare equal.
 */
export function duplicateSections(text) {
  const seen = new Set();
  const problems = [];
  for (const section of parseSections(text)) {
    if (seen.has(section.version)) {
      problems.push(
        `"${section.header.trim()}" appears more than once. A merge has replayed a whole section; ` +
          'keep one copy.',
      );
    }
    seen.add(section.version);
  }
  return problems;
}

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
  return [
    ...changedReleasedSections(baselineText, currentText),
    ...duplicateSections(currentText),
    ...duplicateHeadings(currentText, released),
  ];
}

/**
 * Newest `v*` tag to compare against, excluding any tag on HEAD itself.
 *
 * The exclusion is what makes the publish-time run mean anything. `publish.yml`'s verify job checks
 * out the very tag being released, so the newest tag *is* HEAD: comparing against it would compare
 * the file to itself, pass unconditionally, and — because the version being shipped would then also
 * count as already-released — switch off the duplicate-heading rule for exactly the section being
 * published. Stepping back one tag compares the shipped history against what shipped, and leaves
 * the new section subject to the still-editable rules.
 */
export function baselineTag(run = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  const onHead = new Set(run(['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean));
  const tags = run(['tag', '--list', 'v*', '--sort=-v:refname'])
    .split('\n')
    .filter(Boolean)
    .filter((tag) => !onHead.has(tag));
  return tags[0] ?? null;
}

/** True when the changelog claims shipped releases — used to tell "new repo" from "tags missing". */
export function hasDatedSections(text) {
  return parseSections(text).some((section) => section.version !== UNRELEASED);
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

  const current = readChangelog();
  const tag = baselineTag(exec);
  if (!tag) {
    // A repo with no releases yet has nothing to compare against. A repo whose changelog already
    // lists shipped versions but whose tags are not visible is a broken checkout (shallow clone, or
    // fetch-depth left at its default), and passing there would be a guard that silently does
    // nothing — the failure mode this whole script exists to prevent.
    if (hasDatedSections(current)) {
      throw new Error(
        'changelog-guard: CHANGELOG.md lists released versions but no v* tag is visible. The ' +
          'checkout is missing tags — use fetch-depth: 0.',
      );
    }
    console.log('changelog-guard: no v* tag yet, nothing to compare against.');
    return;
  }

  // Released sections are compared against the tag that published them, so a section is checked
  // against what actually shipped rather than against whatever the base branch currently holds.
  const baseline = exec(['show', `${tag}:CHANGELOG.md`]);
  const problems = check(baseline, current);

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
