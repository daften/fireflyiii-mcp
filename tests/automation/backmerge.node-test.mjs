import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/backmerge.yml', import.meta.url), 'utf8');

// Extract the `run: |` body of the step with the given id, by indentation rather than by matching
// the literal text that happens to follow it. The previous version split on a trailing comment and
// on a hard-coded 8-space indent: rewording the comment made the second split match nothing, so
// `block` silently became the rest of the file and every scenario below executed the remaining
// workflow steps as part of the script instead of failing.
export function extractRunScript(yaml, stepId) {
  const lines = yaml.split('\n');

  const idIndex = lines.findIndex((line) => line.trim() === `id: ${stepId}`);
  if (idIndex === -1) throw new Error(`backmerge.yml: no step with "id: ${stepId}".`);
  const indent = lines[idIndex].slice(0, lines[idIndex].indexOf('id:'));

  // Walk forward to this step's own `run: |`, stopping if the next step starts first, so a later
  // step's run block can never be mistaken for this one's.
  let runIndex = -1;
  for (let i = idIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (!line.startsWith(indent) || line.trimStart().startsWith('- ')) break;
    if (line === `${indent}run: |`) {
      runIndex = i;
      break;
    }
  }
  if (runIndex === -1) throw new Error(`backmerge.yml: the "id: ${stepId}" step has no "run: |" block.`);

  const bodyIndent = `${indent}  `;
  const body = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (!line.startsWith(bodyIndent)) break;
    body.push(line.slice(bodyIndent.length));
  }

  const script = body.join('\n').trim();
  if (!script) throw new Error(`backmerge.yml: the "id: ${stepId}" run block is empty.`);
  return script;
}

const script = extractRunScript(workflow, 'merge');

test('backmerge: the extracted script is the merge step and nothing else', () => {
  assert.match(script, /git merge/);
  // Indentation ends the block, so a following step can never be swallowed into it.
  assert.doesNotMatch(script, /^\s*(?:- name:|uses:|if: )/m);
});

for (const scenario of [
  'already-merged',
  'clean',
  'conflict',
  'merge-error',
  'push-error',
  'race',
  'persistent-race',
  'guard-failure',
]) {
  test(`backmerge: ${scenario}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'backmerge-test-'));
    try {
      const output = join(dir, 'output');
      const mock = `
        pushes=0
        git() {
          case "$1" in
            config|fetch|checkout) return 0 ;;
            rev-list) if [ "$SCENARIO" = already-merged ]; then echo 0; else echo 1; fi ;;
            merge)
              if [ "$2" = --abort ]; then return 0; fi
              case "$SCENARIO" in conflict|merge-error) return 1 ;; esac ;;
            diff) if [ "$SCENARIO" = conflict ]; then echo CHANGELOG.md; fi ;;
            push)
              pushes=$((pushes+1))
              echo "push attempt" >&2
              case "$SCENARIO" in
                push-error|persistent-race) return 1 ;;
                race) [ "$pushes" -gt 1 ] ;;
              esac ;;
            rev-parse)
              if [ "$SCENARIO" = race ] || [ "$SCENARIO" = persistent-race ]; then
                # External file survives the command substitution subshell.
                count=$(cat "$COUNTER" 2>/dev/null || echo 0)
                count=$((count+1)); echo "$count" > "$COUNTER"; echo "$count"
              else echo same-tip; fi ;;
            *) echo "Unexpected git call: $*" >&2; return 99 ;;
          esac
        }
        # changelog-guard.mjs shells out to the real git binary, which this mock (a bash function)
        # cannot intercept, so the whole "node scripts/changelog-guard.mjs" call is faked here
        # instead. Every scenario but guard-failure represents a clean CHANGELOG.md.
        node() {
          case "$SCENARIO" in
            guard-failure) return 1 ;;
            *) return 0 ;;
          esac
        }
      `;
      const result = spawnSync('bash', ['-e', '-c', mock + script], {
        encoding: 'utf8', env: { ...process.env, SCENARIO: scenario, GITHUB_OUTPUT: output, COUNTER: join(dir, 'counter') },
      });
      const fails = ['merge-error', 'push-error', 'persistent-race'].includes(scenario);
      assert.equal(result.status, fails ? 1 : 0, result.stdout + result.stderr);
      if (scenario === 'conflict' || scenario === 'guard-failure') {
        assert.equal(readFileSync(output, 'utf8').trim(), 'conflict=true');
      }
      if (scenario === 'merge-error') assert.match(result.stdout, /without unmerged files/);
      if (scenario === 'push-error') assert.match(result.stdout, /develop has not moved/);
      const expected = {
        'already-merged': 0,
        clean: 1,
        conflict: 0,
        'merge-error': 0,
        'push-error': 1,
        race: 2,
        'persistent-race': 3,
        'guard-failure': 0,
      };
      assert.equal((result.stderr.match(/push attempt/g) || []).length, expected[scenario]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
