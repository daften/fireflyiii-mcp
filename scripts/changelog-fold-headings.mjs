#!/usr/bin/env node
/**
 * Fold duplicate `### Heading` subsections inside `## [Unreleased]` of CHANGELOG.md.
 *
 * Why this exists: a hotfix to `main` adds its own `### Security` bullets under `[Unreleased]`
 * while `develop` already has a `### Security` heading there. `merge=union` keeps both sides, git
 * calls it a clean merge, and `changelog-guard` then (rightly) rejects two headings with the same
 * name. That made `backmerge.yml` open a PR for a human to move the bullets under one heading, which
 * is mechanical work with exactly one right answer (AGENTS.md, "Hotfix releases", step 2).
 *
 * Only `[Unreleased]` is touched: dated sections are immutable and may legitimately contain
 * duplicates that already shipped (0.4.6 has two `### Security` headings). Text with no duplicate
 * headings is returned byte for byte, so running this on a clean file changes nothing.
 *
 *   node scripts/changelog-fold-headings.mjs [path/to/CHANGELOG.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/;
const ANY_VERSION_HEADING = /^## \[/;
const SUBSECTION_HEADING = /^### (.+?)\s*$/;

/** Trim leading and trailing blank lines from an array of lines. */
function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/**
 * @returns {{ text: string, folded: string[] }} `folded` lists the headings that were merged, in
 *   the order they first appear; empty when nothing needed folding.
 */
export function foldDuplicateHeadings(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => UNRELEASED_HEADING.test(line));
  if (start === -1) return { text, folded: [] };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (ANY_VERSION_HEADING.test(lines[i])) {
      end = i;
      break;
    }
  }

  // Everything between `## [Unreleased]` and its first `###` stays where it is.
  const body = lines.slice(start + 1, end);
  const preamble = [];
  const subsections = [];
  for (const line of body) {
    const heading = SUBSECTION_HEADING.exec(line);
    if (heading) {
      subsections.push({ title: heading[1], lines: [] });
    } else if (subsections.length === 0) {
      preamble.push(line);
    } else {
      subsections.at(-1).lines.push(line);
    }
  }

  const merged = new Map();
  const duplicated = new Set();
  for (const subsection of subsections) {
    const existing = merged.get(subsection.title);
    if (existing) {
      existing.lines.push(...trimBlankLines(subsection.lines));
      duplicated.add(subsection.title);
    } else {
      merged.set(subsection.title, { title: subsection.title, lines: [...trimBlankLines(subsection.lines)] });
    }
  }
  if (duplicated.size === 0) return { text, folded: [] };

  const rebuilt = [...preamble];
  // Exactly one blank line between blocks; the preamble's own blank line (if any) counts as the first.
  for (const subsection of merged.values()) {
    if (rebuilt.length === 0 || rebuilt.at(-1).trim() !== '') rebuilt.push('');
    rebuilt.push(`### ${subsection.title}`, '', ...subsection.lines);
  }
  rebuilt.push('');

  const folded = [...merged.keys()].filter((title) => duplicated.has(title));
  return { text: [...lines.slice(0, start + 1), ...rebuilt, ...lines.slice(end)].join('\n'), folded };
}

function main(argv) {
  const path = argv[0] ?? 'CHANGELOG.md';
  const before = readFileSync(path, 'utf8');
  const { text, folded } = foldDuplicateHeadings(before);
  if (folded.length === 0) {
    console.log('changelog-fold-headings: no duplicate headings in [Unreleased]; nothing to do.');
    return;
  }
  writeFileSync(path, text);
  console.log(`changelog-fold-headings: folded duplicate [Unreleased] headings: ${folded.join(', ')}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
