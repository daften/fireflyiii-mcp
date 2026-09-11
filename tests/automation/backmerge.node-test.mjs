import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/backmerge.yml', import.meta.url), 'utf8');
const block = workflow.split('        id: merge\n        run: |\n')[1].split('\n      # Only reached')[0];
const script = block.split('\n').map(line => line.slice(10)).join('\n');

for (const scenario of ['already-merged', 'clean', 'conflict', 'merge-error', 'push-error', 'race', 'persistent-race']) {
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
      `;
      const result = spawnSync('bash', ['-e', '-c', mock + script], {
        encoding: 'utf8', env: { ...process.env, SCENARIO: scenario, GITHUB_OUTPUT: output, COUNTER: join(dir, 'counter') },
      });
      const fails = ['merge-error', 'push-error', 'persistent-race'].includes(scenario);
      assert.equal(result.status, fails ? 1 : 0, result.stdout + result.stderr);
      if (scenario === 'conflict') assert.equal(readFileSync(output, 'utf8').trim(), 'conflict=true');
      if (scenario === 'merge-error') assert.match(result.stdout, /without unmerged files/);
      if (scenario === 'push-error') assert.match(result.stdout, /develop has not moved/);
      const expected = { 'already-merged': 0, clean: 1, conflict: 0, 'merge-error': 0, 'push-error': 1, race: 2, 'persistent-race': 3 };
      assert.equal((result.stderr.match(/push attempt/g) || []).length, expected[scenario]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
