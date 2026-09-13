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
// Nothing downstream notices on its own: backmerge.yml pushes straight to develop and its PR path
// only triggers on a git-level conflict (which union suppresses), and publish.yml only checked that
// a section exists. backmerge.yml now runs this guard against origin/main's pre-merge CHANGELOG.md
// before it pushes, so shape 2 is caught at the one place it actually happens instead of on whatever
// unrelated PR runs next.
//
// This guard is detection, not prevention — by design. It turns all three into a red build.
//
// A deliberate, reviewed edit to a published section (a typo fix, a credit line) is not one of these
// shapes but trips the same immutability check. Add the version to
// scripts/changelog-guard-allowed-edits.json in the same PR — the exemption then lives in the repo,
// not in that PR's title, so every later run (push, nightly, publish) honors it too.

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

/** Where the trailing link-reference block starts, scanning from the end of the file. */
function trailingLinkBlockStart(lines) {
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1];
    if (line.trim() === '' || LINK_DEFINITION.test(line)) {
      end -= 1;
      continue;
    }
    break;
  }
  return end;
}

function stripTrailingLinkBlock(lines) {
  return lines.slice(0, trailingLinkBlockStart(lines));
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
 * Any later change to one is either a union misfiling (shapes 1 and 2 above) or a deliberate,
 * reviewed edit — which is exempted by listing the version in `allowedEdits` rather than by a
 * per-run skip, since the comparison is repeated on every push, nightly build and publish, most of
 * which have no PR title to read a skip flag from.
 */
export function changedReleasedSections(baselineText, currentText, allowedEdits = new Set(), baselineLabel = 'the baseline') {
  const current = new Map(parseSections(currentText).map((s) => [s.version, s]));
  const problems = [];

  for (const base of parseSections(baselineText)) {
    if (base.version === UNRELEASED || allowedEdits.has(base.version)) continue;
    const now = current.get(base.version);
    if (!now) {
      problems.push(`Released section "${base.header.trim()}" has been removed.`);
      continue;
    }
    if (sectionText(now) !== sectionText(base)) {
      problems.push(
        `Released section "${base.header.trim()}" was modified (compared against ${baselineLabel}). ` +
          'Released sections are immutable — this is almost always the merge=union driver splicing ' +
          'entries from a stale branch, or a back-merge absorbing [Unreleased] entries into the ' +
          `release that just shipped. Run \`git diff ${baselineLabel} -- CHANGELOG.md\` to see exactly ` +
          'what changed. If the content belongs under [Unreleased], move it there instead of leaving ' +
          `it here too. If this is a deliberate, reviewed edit, add "${base.version}" to ` +
          'scripts/changelog-guard-allowed-edits.json in this PR instead of working around the guard.',
      );
    }
  }

  return problems;
}

/** Parse an `X.Y.Z` version for ordering purposes; missing components sort as 0. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Dated sections must read newest-first. A release PR merged into `main` while another release
 * branch is also in flight is a real three-way merge, not a conflict `merge=union` needs to resolve
 * — so it can silently interleave two releases' sections with no blank line between them, which
 * `parseSections` alone does not notice since it only splits on `## [...]` headers.
 */
export function sectionOrder(text) {
  const versions = parseSections(text)
    .map((section) => section.version)
    .filter((version) => version !== UNRELEASED);
  const problems = [];
  for (let i = 1; i < versions.length; i += 1) {
    if (compareVersions(versions[i - 1], versions[i]) <= 0) {
      problems.push(
        `Dated sections are out of order: "## [${versions[i - 1]}]" appears above "## [${versions[i]}]", ` +
          'which is not an older version. A merge has likely interleaved two releases; keep dated ' +
          'sections in strictly descending version order.',
      );
    }
  }
  return problems;
}

/**
 * Two releases landing on `main` independently can each add their own `[Unreleased]:` or
 * `[X.Y.Z]:` compare-link definition to the trailing link block. CommonMark resolves a repeated
 * label to the first definition, so the second is not a harmless leftover — it silently points a
 * compare link at the wrong release. `stripTrailingLinkBlock` removes this block from every other
 * check, so it is the only place a duplicate here would be caught.
 */
export function duplicateLinkLabels(text) {
  const lines = text.split('\n');
  const linkLines = lines.slice(trailingLinkBlockStart(lines)).filter((line) => LINK_DEFINITION.test(line));
  const seen = new Set();
  const problems = [];
  for (const line of linkLines) {
    const label = /^\[([^\]]+)\]:/.exec(line)[1];
    if (seen.has(label)) {
      problems.push(
        `Link definition "[${label}]:" is defined more than once. A merge has likely spliced two ` +
          'link-reference blocks together; keep one definition per label.',
      );
    }
    seen.add(label);
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

export function check(baselineText, currentText, allowedEdits = new Set(), baselineLabel = 'the baseline') {
  const released = new Set(
    parseSections(baselineText)
      .map((section) => section.version)
      .filter((version) => version !== UNRELEASED),
  );
  return [
    ...changedReleasedSections(baselineText, currentText, allowedEdits, baselineLabel),
    ...duplicateSections(currentText),
    ...duplicateHeadings(currentText, released),
    ...sectionOrder(currentText),
    ...duplicateLinkLabels(currentText),
  ];
}

/**
 * Versions with a deliberate, reviewed edit to their published section — a typo fix, a credit line
 * added after the fact. Keyed by version so the exemption lives in the repo (this file, checked in
 * alongside the edit's PR) instead of a PR title: every later run — push, nightly, publish — reads
 * the same file, so the exemption survives past the one PR that made the edit.
 *
 * Format: `{ "0.4.6": "why, and which PR reviewed it" }`. The reason is for humans reading the file;
 * only the keys are read here.
 */
export function loadAllowedEdits(
  readFile = () => readFileSync('scripts/changelog-guard-allowed-edits.json', 'utf8'),
) {
  let raw;
  try {
    raw = readFile();
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
  return new Set(Object.keys(JSON.parse(raw)));
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

const BASELINE_REF_FLAG = '--baseline-ref=';

export function run(
  env = process.env,
  exec = (args) => execFileSync('git', args, { encoding: 'utf8' }),
  readChangelog = () => readFileSync('CHANGELOG.md', 'utf8'),
  argv = process.argv.slice(2),
  readAllowedEdits = undefined,
) {
  if (env.CHANGELOG_GUARD_SKIP === 'true') {
    console.log('changelog-guard skipped ([skip changelog-guard]).');
    return;
  }

  const current = readChangelog();
  const refFlag = argv.find((arg) => arg.startsWith(BASELINE_REF_FLAG));

  let baselineSource;
  if (refFlag) {
    // Explicit ref, not a tag lookup: backmerge.yml passes --baseline-ref=origin/main to check the
    // merge result against main's pre-merge CHANGELOG.md before it ever reaches develop, since the
    // corruption this guard exists for happens at that merge and not at the next tag.
    baselineSource = refFlag.slice(BASELINE_REF_FLAG.length);
  } else {
    const tag = baselineTag(exec);
    if (!tag) {
      // A repo with no releases yet has nothing to compare against. A repo whose changelog already
      // lists shipped versions but whose tags are not visible is a broken checkout (shallow clone,
      // or fetch-depth left at its default), and passing there would be a guard that silently does
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
    baselineSource = tag;
  }

  // Compared against the newest tag prior to HEAD (or the explicit ref above), not against whatever
  // the base branch currently holds. Note this baseline is a single global snapshot, not "each
  // section against its own tag": an undetected corruption that survives to the next tagged release
  // becomes part of that release's baseline and is not flagged again after that. `allowedEdits` is
  // for sanctioned edits only, not a substitute for catching corruption the first time.
  const baseline = exec(['show', `${baselineSource}:CHANGELOG.md`]);
  const allowedEdits = loadAllowedEdits(readAllowedEdits);
  const problems = check(baseline, current, allowedEdits, baselineSource);

  if (problems.length) {
    for (const problem of problems) console.error(`::error file=CHANGELOG.md::${problem}`);
    throw new Error(`changelog-guard found ${problems.length} problem(s) against ${baselineSource}.`);
  }
  console.log(`changelog-guard: CHANGELOG.md is consistent with ${baselineSource}.`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
