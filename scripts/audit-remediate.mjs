#!/usr/bin/env node
/**
 * Logic behind `audit-remediate.yml`: turn a failing `npm audit --json` into a lockfile-only fix.
 *
 * When the nightly strict audit goes red and Dependabot has not opened a security PR, AGENTS.md says
 * to fix it by hand as a hotfix: update just the vulnerable lockfile entries (`npm update <pkg>`, not
 * `npm audit fix`, which refreshes unrelated packages too), add a `### Security` bullet, open a PR.
 * That procedure is mechanical, so this script does the parts that need judgement and parsing, and
 * the workflow does the git and GitHub plumbing.
 *
 *   plan       <audit.json>                                  vulnerable packages to `npm update`, one per line
 *   changed    <audit.json> <lock-before> <lock-after>   true when an audited package's version changed
 *   changelog  <audit.json> <lock-before> <lock-after> [CHANGELOG.md]   add the Security bullets in place
 *   summary    <audit-before> <audit-after> <lock-before> <lock-after>  Markdown for the PR body
 *
 * What counts: advisories of moderate severity or higher, as in the nightly audit
 * (`npm audit --audit-level=moderate --omit=dev`). In `npm audit --json`, an entry of a package's
 * `via` array that is an object is a real advisory; a string only names another vulnerable package
 * this one depends on, so those are never updated for their own sake.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Same gate as the nightly audit (`--audit-level=moderate`): it decides which packages are fixed.
// Once a package is being updated, every advisory the update resolves is reported, low ones too.
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const ACTIONABLE = new Set(['moderate', 'high', 'critical']);
const ADVISORY_ID = /\/advisories\/(GHSA-[0-9a-z-]+)/i;

function parseAudit(auditJson) {
  const audit = typeof auditJson === 'string' ? JSON.parse(auditJson) : auditJson;
  // `npm audit --json` prints {"error": {...}} when it cannot reach the registry. Reading that as
  // "no vulnerabilities" would turn a network failure into a silent all-clear.
  if (audit.error) {
    throw new Error(`npm audit failed: ${audit.error.summary || audit.error.code || audit.error.detail || 'npm gave no detail (usually the registry was unreachable)'}`);
  }
  if (!audit.vulnerabilities || typeof audit.vulnerabilities !== 'object') {
    throw new Error('Not an npm audit report: no "vulnerabilities" object.');
  }
  return audit;
}

/**
 * package name -> [{ id, url, severity, title }]. By default only packages with at least one
 * moderate+ advisory appear, and only their moderate+ advisories; with `all` a listed package shows
 * every advisory it has, whatever the severity.
 */
export function advisoriesByPackage(auditJson, { all = false } = {}) {
  const audit = parseAudit(auditJson);
  const result = new Map();
  for (const [name, entry] of Object.entries(audit.vulnerabilities)) {
    const advisories = [];
    const gated = (entry.via ?? []).some((via) => typeof via === 'object' && ACTIONABLE.has(via.severity));
    if (!gated) continue;
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || (!all && !ACTIONABLE.has(via.severity))) continue;
      advisories.push({
        id: ADVISORY_ID.exec(via.url ?? '')?.[1] ?? via.url ?? `advisory-${via.source}`,
        url: via.url,
        severity: via.severity,
        title: String(via.title ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
    if (advisories.length > 0) result.set(name, advisories);
  }
  return result;
}

/**
 * Which packages `npm update` can fix, and which it cannot.
 * `fixAvailable` is `true` when updating the vulnerable package itself is enough, an object when the
 * fix is a newer version of another package (and `isSemVerMajor` says whether that jump is breaking),
 * and `false` when no fix exists yet. A major bump is never applied unattended.
 */
export function planUpdates(auditJson) {
  const audit = parseAudit(auditJson);
  const update = new Set();
  const blocked = [];
  for (const name of advisoriesByPackage(audit).keys()) {
    const fix = audit.vulnerabilities[name].fixAvailable;
    if (fix === true) {
      update.add(name);
    } else if (fix && typeof fix === 'object' && fix.isSemVerMajor === false) {
      update.add(fix.name ?? name);
    } else if (fix && typeof fix === 'object') {
      blocked.push({ name, reason: `fixing it needs a major update of ${fix.name} to ${fix.version}` });
    } else {
      blocked.push({ name, reason: 'no patched version is available yet' });
    }
  }
  return { update: [...update].sort(), blocked };
}

/** package name -> sorted unique versions of its non-dev copies in a package-lock.json. */
export function lockVersions(lockText) {
  const lock = typeof lockText === 'string' ? JSON.parse(lockText) : lockText;
  const versions = new Map();
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    const marker = 'node_modules/';
    if (!path.includes(marker) || meta.dev === true || !meta.version) continue;
    const name = path.slice(path.lastIndexOf(marker) + marker.length);
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(meta.version);
  }
  return new Map([...versions].map(([name, set]) => [name, [...set].sort()]));
}

/** What the update changed for each package that had an advisory. Unchanged packages are left out. */
export function describeChanges(auditBefore, lockBefore, lockAfter) {
  const audit = parseAudit(auditBefore);
  const before = lockVersions(lockBefore);
  const after = lockVersions(lockAfter);
  const changes = [];
  for (const [name, advisories] of advisoriesByPackage(audit, { all: true })) {
    const from = before.get(name) ?? [];
    const to = after.get(name) ?? [];
    if (from.join() === to.join()) continue;
    changes.push({ name, direct: audit.vulnerabilities[name].isDirect === true, from, to, advisories });
  }
  return changes;
}

/**
 * True when the update changed the version of at least one audited package. A lockfile can differ in
 * text without that: a different npm version rewrites fields such as `libc` on unrelated optional
 * entries, and a PR made of only that would claim a fix it did not make.
 */
export function hasAuditedChange(auditBefore, lockBefore, lockAfter) {
  return describeChanges(auditBefore, lockBefore, lockAfter).length > 0;
}

function highestSeverity(advisories) {
  return advisories.reduce((top, a) => (SEVERITY_RANK[a.severity] > SEVERITY_RANK[top] ? a.severity : top), 'info');
}

export function securityBullets(changes) {
  return changes.map(({ name, direct, from, to, advisories }) => {
    const ids = advisories.map((a) => `[${a.id}](${a.url})`).join(', ');
    const titles = [...new Set(advisories.map((a) => a.title.replace(/[.\s]+$/, '')))].join('; ');
    const kind = direct ? 'direct dependency' : 'transitive';
    return `- Bumped ${kind} \`${name}\` ${from.join(', ') || '(new)'} to ${to.join(', ') || '(removed)'} (${ids}; ${highestSeverity(advisories)}): ${titles}. Lockfile only (automated audit fix).`;
  });
}

/** Insert bullets under `### Security` in `## [Unreleased]`, creating the heading when it is missing. */
export function addSecurityBullets(changelog, bullets) {
  if (bullets.length === 0) return changelog;
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => /^## \[Unreleased\]\s*$/.test(line));
  if (start === -1) throw new Error('CHANGELOG.md has no "## [Unreleased]" section.');
  let end = lines.findIndex((line, i) => i > start && /^## \[/.test(line));
  if (end === -1) end = lines.length;

  const lastContentLine = (from, to) => {
    for (let i = to - 1; i >= from; i -= 1) if (lines[i].trim() !== '') return i;
    return from - 1;
  };

  const heading = lines.findIndex((line, i) => i > start && i < end && /^### Security\s*$/.test(line));
  if (heading !== -1) {
    let sectionEnd = end;
    for (let i = heading + 1; i < end; i += 1) {
      if (/^### /.test(lines[i])) {
        sectionEnd = i;
        break;
      }
    }
    lines.splice(lastContentLine(heading + 1, sectionEnd) + 1, 0, ...bullets);
    return lines.join('\n');
  }

  const insertAt = lastContentLine(start + 1, end) + 1;
  const block = ['', '### Security', '', ...bullets];
  // Keep one blank line before the next dated section.
  if (end < lines.length && lines[end - 1]?.trim() !== '') block.push('');
  lines.splice(insertAt, 0, ...block);
  return lines.join('\n');
}

/** Markdown for the PR body: what was fixed, what is still open, what could not be fixed. */
export function summaryMarkdown(auditBefore, auditAfter, lockBefore, lockAfter) {
  const changes = describeChanges(auditBefore, lockBefore, lockAfter);
  const remaining = advisoriesByPackage(auditAfter);
  const blocked = planUpdates(auditAfter).blocked;
  const out = [];
  out.push('### Updated (lockfile only, `package.json` untouched)', '');
  if (changes.length === 0) out.push('_Nothing changed._');
  for (const { name, from, to, advisories } of changes) {
    out.push(`- \`${name}\` ${from.join(', ') || '(new)'} to ${to.join(', ') || '(removed)'}: ${advisories.map((a) => `[${a.id}](${a.url}) (${a.severity})`).join(', ')}`);
  }
  out.push('', '### Still reported by `npm audit --omit=dev` after the update', '');
  if (remaining.size === 0) out.push('_None. The strict nightly audit should pass once this reaches `develop`._');
  for (const [name, advisories] of remaining) {
    const why = blocked.find((b) => b.name === name)?.reason;
    out.push(`- \`${name}\`: ${advisories.map((a) => `[${a.id}](${a.url}) (${a.severity})`).join(', ')}${why ? `. Not fixed here: ${why}.` : ''}`);
  }
  return out.join('\n');
}

function main(argv) {
  const [command, ...args] = argv;
  try {
    if (command === 'plan') {
      const { update, blocked } = planUpdates(readFileSync(args[0], 'utf8'));
      for (const { name, reason } of blocked) console.error(`::warning::Cannot fix ${name} automatically: ${reason}.`);
      for (const name of update) console.log(name);
    } else if (command === 'changed') {
      const [auditPath, lockBefore, lockAfter] = args;
      console.log(String(hasAuditedChange(readFileSync(auditPath, 'utf8'), readFileSync(lockBefore, 'utf8'), readFileSync(lockAfter, 'utf8'))));
    } else if (command === 'changelog') {
      const [auditPath, lockBefore, lockAfter, changelogPath = 'CHANGELOG.md'] = args;
      const bullets = securityBullets(describeChanges(readFileSync(auditPath, 'utf8'), readFileSync(lockBefore, 'utf8'), readFileSync(lockAfter, 'utf8')));
      if (bullets.length === 0) {
        console.log('audit-remediate: the lockfile changes touch no audited package; CHANGELOG.md left alone.');
        return;
      }
      writeFileSync(changelogPath, addSecurityBullets(readFileSync(changelogPath, 'utf8'), bullets));
      console.log(bullets.join('\n'));
    } else if (command === 'summary') {
      const [auditBefore, auditAfter, lockBefore, lockAfter] = args.map((path) => readFileSync(path, 'utf8'));
      console.log(summaryMarkdown(auditBefore, auditAfter, lockBefore, lockAfter));
    } else {
      throw new Error('usage: audit-remediate.mjs <plan|changed|changelog|summary> ...');
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
