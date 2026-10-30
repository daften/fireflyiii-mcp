import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs the real `run:` blocks of audit-remediate.yml offline: git, npm and gh are shell functions, the
// remediation script and the audit fixture (a real `npm audit --json`) are real. The point is the part
// a unit test of the script cannot see: what each outcome writes to the job summary and the notice
// annotations, and which outputs the next step reads.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(new URL('../../.github/workflows/audit-remediate.yml', import.meta.url), 'utf8');
const vulnerable = fileURLToPath(new URL('./fixtures/npm-audit-vulnerable.json', import.meta.url));
const clean = '{"auditReportVersion":2,"vulnerabilities":{},"metadata":{"vulnerabilities":{"total":0}}}';

/** The `run: |` body of the step with the given name, found by indentation. */
export function extractRunByName(yaml, name) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start === -1) throw new Error(`audit-remediate.yml: no step named "${name}".`);
  const stepIndent = lines[start].slice(0, lines[start].indexOf('- name:'));
  const keyIndent = `${stepIndent}  `;
  let run = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith(`${stepIndent}- `)) break;
    if (lines[i] === `${keyIndent}run: |`) {
      run = i;
      break;
    }
  }
  if (run === -1) throw new Error(`audit-remediate.yml: step "${name}" has no "run: |" block.`);
  const bodyIndent = `${keyIndent}  `;
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (!line.startsWith(bodyIndent)) break;
    body.push(line.slice(bodyIndent.length));
  }
  return body.join('\n').trim();
}

const STEP = {
  open: 'Skip when a fix PR is already open',
  plan: 'Find the branch that needs a fix',
  pr: 'Open the PR',
};

const mocks = `
  CURRENT=main
  git() {
    case "$1" in
      checkout) CURRENT="\${!#}"; CURRENT="\${CURRENT#origin/}" ;;
      config|add|commit|push) echo "git $*" >> "$CALLS" ;;
      show) echo "github-actions[bot] <bot@example.com>" ;;
      *) echo "Unexpected git call: $*" >&2; return 99 ;;
    esac
  }
  npm() {
    [ "$1" = audit ] || { echo "Unexpected npm call: $*" >&2; return 99; }
    case "$SCENARIO:$CURRENT" in
      main-vulnerable:main|develop-only:develop|both:*) cat "$VULNERABLE" ;;
      audit-fails:*) echo '{"error":{"summary":"","detail":""}}'; return 1 ;;
      *) echo "$CLEAN" ;;
    esac
  }
  gh() {
    echo "gh $*" >> "$CALLS"
    case "$1 $2" in
      "pr list") echo "$OPEN_COUNT" ;;
      "pr create") echo "https://github.com/daften/fireflyiii-mcp/pull/7" ;;
    esac
  }
`;

function runStep(stepName, { scenario = 'clean', open = '0', dryRun = '', base = 'main', files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-wf-'));
  try {
    const tmp = join(dir, 'tmp');
    spawnSync('mkdir', ['-p', tmp]);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(tmp, name), content);
    const out = join(dir, 'output');
    const summary = join(dir, 'summary');
    const calls = join(dir, 'calls');
    for (const file of [out, summary, calls]) writeFileSync(file, '');
    const result = spawnSync('bash', ['-e', '-c', mocks + extractRunByName(workflow, stepName)], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        SCENARIO: scenario,
        OPEN_COUNT: open,
        DRY_RUN: dryRun,
        BASE: base,
        REPO: 'daften/fireflyiii-mcp',
        RUN_URL: 'https://github.com/daften/fireflyiii-mcp/actions/runs/1',
        GITHUB_RUN_ID: '4242',
        RUNNER_TEMP: tmp,
        GITHUB_OUTPUT: out,
        GITHUB_STEP_SUMMARY: summary,
        CALLS: calls,
        VULNERABLE: vulnerable,
        CLEAN: clean,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs: readFileSync(out, 'utf8'),
      summary: readFileSync(summary, 'utf8'),
      calls: readFileSync(calls, 'utf8'),
      tmpFile: (name) => readFileSync(join(tmp, name), 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the steps this test runs exist in the workflow', () => {
  for (const name of Object.values(STEP)) assert.ok(extractRunByName(workflow, name).length > 0, name);
});

test('open: no fix PR open -> open=0 and only the heading in the summary', () => {
  const r = runStep(STEP.open, { open: '0' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.outputs, /^open=0$/m);
  assert.match(r.summary, /### Audit remediation/);
  assert.doesNotMatch(r.summary, /Skipped/);
  assert.doesNotMatch(r.stdout, /::notice::/);
});

test('open: a fix PR already open -> open=1, a notice and a "Skipped" line on the run page', () => {
  const r = runStep(STEP.open, { open: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.outputs, /^open=1$/m);
  assert.match(r.stdout, /::notice::A fix PR .* is already open/);
  assert.match(r.summary, /Skipped: a fix PR .* is already open, so no new one was opened\./);
});

test('plan: advisories on main -> base=main, the six packages, and a summary line naming them', () => {
  const r = runStep(STEP.plan, { scenario: 'main-vulnerable' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.outputs, /^base=main$/m);
  assert.match(r.summary, /Fixable advisories found on \*\*main\*\*: @hono\/node-server body-parser fast-uri ip-address qs zod/);
  assert.doesNotMatch(r.stdout, /Nothing to remediate/);
});

test('plan: only develop is vulnerable -> base=develop', () => {
  const r = runStep(STEP.plan, { scenario: 'develop-only' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.outputs, /^base=develop$/m);
  assert.match(r.stdout, /main: no fixable moderate\+ advisory\./);
});

test('plan: nothing to fix -> no base output, a notice, and the answer on the run page', () => {
  const r = runStep(STEP.plan, { scenario: 'clean' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.outputs, /base=/);
  assert.match(r.stdout, /::notice::Nothing to remediate: no fixable moderate\+ advisory on main or develop\./);
  assert.match(r.summary, /No fixable moderate or higher advisory on \*\*main\*\* or \*\*develop\*\*, so nothing was changed and no PR was opened\./);
});

test('plan: a failed npm audit fails the step; it is never read as "nothing to fix"', () => {
  const r = runStep(STEP.plan, { scenario: 'audit-fails' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /npm audit failed/);
  assert.doesNotMatch(r.summary, /No fixable moderate/);
  assert.doesNotMatch(r.stdout, /::notice::Nothing to remediate/);
});

const prFiles = {
  'packages.txt': 'qs\nzod\n',
  'summary.md': '### Updated (lockfile only)\n\n- `zod` 4.5.4 to 4.6.7: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (high)',
};

test('pr: a real run pushes, opens the PR and puts its link in the summary and a notice', () => {
  const r = runStep(STEP.pr, { base: 'main', files: prFiles });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, /git push origin HEAD:refs\/heads\/automation\/audit-fix-main-4242/);
  assert.match(r.calls, /gh pr create --repo daften\/fireflyiii-mcp --base main --head automation\/audit-fix-main-4242 --title fix\(deps\): bump qs, zod to patched versions \(automated\)/);
  assert.match(r.stdout, /::notice::Opened the audit fix PR: https:\/\/github\.com\/daften\/fireflyiii-mcp\/pull\/7/);
  assert.match(r.summary, /Opened a fix PR into \*\*main\*\*: https:\/\/github\.com\/daften\/fireflyiii-mcp\/pull\/7/);
  assert.match(r.summary, /`zod` 4\.5\.4 to 4\.6\.7/);
});

test('pr: a dry run pushes nothing and opens no PR, and says so on the run page', () => {
  const r = runStep(STEP.pr, { base: 'main', dryRun: 'true', files: prFiles });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.calls, /git push|gh pr create/);
  assert.match(r.stdout, /::notice::Dry run: a fix PR into main is ready but was not pushed\./);
  assert.match(r.summary, /\*\*Dry run\.\*\* Nothing was pushed\. A real run would open a PR into \*\*main\*\*/);
  assert.match(r.summary, /`zod` 4\.5\.4 to 4\.6\.7/);
});

test('pr: more than three packages are counted in the title, and a develop-only fix targets develop', () => {
  const r = runStep(STEP.pr, { base: 'develop', files: { ...prFiles, 'packages.txt': 'a\nb\nc\nd\n' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.calls, /--base develop --head automation\/audit-fix-develop-4242 --title fix\(deps\): bump 4 dependencies with security advisories to patched versions \(automated\)/);
});
