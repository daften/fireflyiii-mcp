// Contract test: every HTTP request any tool makes must be a route Firefly III actually serves.
//
// Unit tests elsewhere mock the client and assert the path the code builds, so they cannot notice
// when that path does not exist upstream. Six tools shipped calling routes that no Firefly III v6
// release has ever had (#117). This test registers every tool against a recording client, calls
// each handler with schema-generated arguments, and checks each recorded request against snapshots
// of Firefly's route table for the oldest supported release and the newest one tested.
//
// Refresh or add a snapshot with `node scripts/update-firefly-routes.mjs vX.Y.Z`.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { FireflyClient } from '../client.js';
import { registerAllTools } from '../tools/index.js';
import { createMockServer } from './_helpers.js';

const SNAPSHOTS = ['v6.4.0', 'v6.7.7'] as const;

const routeTables = Object.fromEntries(
  SNAPSHOTS.map((tag) => {
    const { routes } = JSON.parse(
      readFileSync(new URL(`./fixtures/firefly-routes-${tag}.json`, import.meta.url), 'utf8'),
    ) as { routes: string[] };
    return [
      tag,
      routes.map((route) => {
        const [method, path] = route.split(' ');
        return { method, pattern: new RegExp(`^${path.replace(/\{\}/g, '[^/]+')}$`) };
      }),
    ];
  }),
);

/** A plausible value for any schema the tools use, filling optional fields too for maximum coverage. */
function sample(schema: z.ZodType): unknown {
  const def = (schema as unknown as { _zod: { def: Record<string, unknown> } })._zod.def;
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
      return sample(def.innerType as z.ZodType);
    case 'pipe':
      return sample(def.in as z.ZodType);
    case 'number':
      return 7;
    case 'boolean':
      return true;
    case 'enum':
      return Object.values(def.entries as Record<string, string>)[0];
    case 'array':
      return [sample(def.element as z.ZodType)];
    case 'object':
      return Object.fromEntries(
        Object.entries(def.shape as Record<string, z.ZodType>).map(([key, value]) => [key, sample(value)]),
      );
    default:
      return '7'; // strings, dates and ids alike: '7' satisfies every id-shaped parameter
  }
}

// One JSON:API item whose attributes satisfy the read-before-write tools (a transaction group with
// a split whose journal id matches the sampled '7', a piggy bank with a linked account), wrapped so
// it unwraps both as a single resource and as a one-item list.
const item = {
  id: '7',
  type: 'fixture',
  attributes: { group_title: 'Group', transactions: [{ transaction_journal_id: '7' }], accounts: [] },
};
const response = {
  data: Object.assign([item], item),
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

type Call = { tool: string; method: string; path: string };

/** Registers every tool against a recording client and calls each handler once, in sequence. */
async function recordAllToolCalls(): Promise<{ calls: Call[]; tools: string[] }> {
  const calls: Call[] = [];
  let tool = '';
  const record = (method: string, result: unknown) => async (path: string) => {
    calls.push({ tool, method, path });
    return result;
  };
  const client = {
    cacheKey: () => 'contract-test',
    get: record('GET', response),
    getText: record('GET', ''),
    getBinary: record('GET', { data: Buffer.from(''), contentType: 'text/plain', filename: 'f' }),
    post: record('POST', response),
    postBinary: record('POST', undefined),
    put: record('PUT', response),
    delete: record('DELETE', undefined),
  } as unknown as FireflyClient;
  const { server, handlers, toolConfigs } = createMockServer();
  registerAllTools(server, client);
  for (const [name, handler] of handlers) {
    tool = name;
    const shape = (toolConfigs.get(name) as { inputSchema?: Record<string, z.ZodType> }).inputSchema ?? {};
    await handler(Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, sample(value)])));
  }
  return { calls, tools: [...handlers.keys()] };
}

describe('Firefly III API contract', () => {
  let recorded: { calls: Call[]; tools: string[] };

  beforeAll(async () => {
    recorded = await recordAllToolCalls();
  });

  it('exercises every registered tool', () => {
    const silent = recorded.tools.filter((name) => !recorded.calls.some((call) => call.tool === name));
    expect(silent, 'tools that made no request (extend the fixture so their write path runs)').toEqual([]);
  });

  describe.each(SNAPSHOTS)('against the Firefly III %s route table', (tag) => {
    it('every request matches a route Firefly III serves', () => {
      const unknown = recorded.calls
        .filter(({ method, path }) => {
          const full = `/v1${path.split('?')[0]}`;
          return !routeTables[tag].some((route) => route.method === method && route.pattern.test(full));
        })
        .map(({ tool, method, path }) => `${tool}: ${method} /v1${path}`);
      expect(unknown).toEqual([]);
    });
  });
});
