// Keeps the hand-written tool inventories in the docs in step with what the server registers. They
// drifted before: AGENTS.md listed five tools that never existed and missed forty-one real ones.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FireflyClient } from '../client.js';
import { PRESETS, registerAllTools, TOOL_GROUPS, type ToolFilterOptions } from '../tools/index.js';
import { createMockServer } from './_helpers.js';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function registered(options: ToolFilterOptions = {}): string[] {
  const { server, handlers } = createMockServer();
  registerAllTools(server, {} as FireflyClient, options);
  return [...handlers.keys()];
}

const allTools = registered();
const readOnlyTotal = registered({ readOnly: true }).length;

describe('documentation matches the registered tools', () => {
  it('AGENTS.md lists exactly the tools each group file registers', () => {
    const agents = read('AGENTS.md');
    for (const group of TOOL_GROUPS) {
      const line = agents.split('\n').find((l) => new RegExp(`[├└]── ${group}\\.ts\\s+#`).test(l));
      expect(line, `AGENTS.md has no file-structure line for ${group}.ts`).toBeDefined();
      const listed = line!
        .split('#')[1]
        .split(',')
        .map((name) => name.trim());
      expect(listed, `AGENTS.md tool list for ${group}.ts`).toEqual(registered({ groups: [group] }));
    }
  });

  it('docs/reference/tools.md has one row per registered tool', () => {
    const rows = [...read('docs/reference/tools.md').matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
    expect([...rows].sort()).toEqual([...allTools].sort());
  });

  it.each([
    'README.md',
    'AGENTS.md',
    'docker-compose.yml',
    'docs/index.md',
    'docs/guide/index.md',
    'docs/guide/stdio.md',
    'docs/reference/tools.md',
    'docs/reference/filtering.md',
    'docs/contributing/new-tool.md',
  ])('every "N tools" count in %s is current', (path) => {
    const counts = [...read(path).matchAll(/\b(\d+) tools\b/g)].map((m) => Number(m[1]));
    for (const count of counts) expect([allTools.length, readOnlyTotal]).toContain(count);
  });

  it.each(['docs/reference/filtering.md', 'AGENTS.md'])('the preset table in %s has the current counts', (path) => {
    const rows = [...read(path).matchAll(/^\| `([a-z]+)` \| [^|]+ \| (\d+) \|$/gm)];
    expect(rows.map((m) => m[1]).sort()).toEqual(Object.keys(PRESETS).sort());
    for (const [, preset, count] of rows) {
      expect(Number(count), `${path}: ${preset}`).toBe(registered({ preset: preset as keyof typeof PRESETS }).length);
    }
  });
});
