import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FireflyError } from '../client.js';
import {
  buildTransactionListQuery,
  createTtlCache,
  dateOrDateTimeSchema,
  dateSchema,
  defineTool,
  parseId,
} from '../tools/_helpers.js';

function makeServer() {
  let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
  const server = {
    registerTool: vi.fn(
      (_name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        capturedHandler = handler;
      },
    ),
    getHandler: () => capturedHandler!,
  };
  return server;
}

describe('defineTool', () => {
  it('serialises object result to compact JSON', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' }, async () => ({ foo: 'bar', n: 1 }));
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: '{"foo":"bar","n":1}' }],
    });
  });

  it('passes string result through without double-encoding', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' }, async () => 'col1,col2\n1,2');
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'col1,col2\n1,2' }],
    });
  });

  it('wraps thrown FireflyError into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' }, async () => {
      throw new FireflyError(404, '/test', '');
    });
    const result = await server.getHandler()({});
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Resource not found.' }],
    });
  });

  it('wraps generic Error into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' }, async () => {
      throw new Error('boom');
    });
    const result = await server.getHandler()({});
    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'boom' }] });
  });
});

describe('dateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(() => dateSchema.parse('2026-01-15')).not.toThrow();
    expect(() => dateSchema.parse('2000-12-31')).not.toThrow();
  });

  it('rejects slash-separated dates', () => {
    expect(() => dateSchema.parse('2026/01/15')).toThrow('Date must be YYYY-MM-DD');
  });

  it('rejects US-format dates', () => {
    expect(() => dateSchema.parse('01-15-2026')).toThrow('Date must be YYYY-MM-DD');
  });

  it('rejects natural-language dates', () => {
    expect(() => dateSchema.parse('Jan 15 2026')).toThrow('Date must be YYYY-MM-DD');
  });
});

describe('dateOrDateTimeSchema', () => {
  it('accepts YYYY-MM-DD for backward compatibility', () => {
    expect(() => dateOrDateTimeSchema.parse('2026-01-15')).not.toThrow();
  });

  it('accepts RFC 3339 date-times with UTC or an explicit offset', () => {
    expect(() => dateOrDateTimeSchema.parse('2026-07-25T12:30:00Z')).not.toThrow();
    expect(() => dateOrDateTimeSchema.parse('2026-07-25T14:30:00+02:00')).not.toThrow();
  });

  it('rejects date-times without a timezone', () => {
    expect(() => dateOrDateTimeSchema.parse('2026-07-25T14:30:00')).toThrow(
      'Date must be YYYY-MM-DD or an RFC 3339 date-time with timezone',
    );
  });

  it('rejects invalid date-times', () => {
    expect(() => dateOrDateTimeSchema.parse('2026-02-30T12:30:00Z')).toThrow(
      'Date must be YYYY-MM-DD or an RFC 3339 date-time with timezone',
    );
  });
});

describe('parseId', () => {
  it('returns clean numeric string', () => {
    expect(parseId('42')).toBe('42');
  });

  it('extracts leading numeric ID from rich label', () => {
    expect(parseId('42 (Checking)')).toBe('42');
    expect(parseId('5 (Groceries)')).toBe('5');
  });

  it('rejects a value with no leading numeric ID instead of passing it into a URL path', () => {
    expect(() => parseId('no-numbers')).toThrow('is not a valid ID');
    expect(() => parseId('../budgets/5')).toThrow('is not a valid ID');
  });
});

describe('buildTransactionListQuery', () => {
  it('always includes page and limit', () => {
    expect(buildTransactionListQuery({ page: 1, limit: 50 })).toEqual({ page: 1, limit: 50 });
  });

  it('adds type, start, and end only when provided', () => {
    expect(
      buildTransactionListQuery({ type: 'withdrawal', start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 }),
    ).toEqual({ type: 'withdrawal', start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
  });

  it('omits type, start, and end when absent', () => {
    expect(buildTransactionListQuery({ page: 2, limit: 10 })).toEqual({ page: 2, limit: 10 });
  });
});

describe('createTtlCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a fresh entry from cache without re-fetching', async () => {
    const cache = createTtlCache<string>(1000);
    const fetchFn = vi.fn().mockResolvedValue('v');
    await cache.get('a', fetchFn);
    await cache.get('a', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('sweeps expired entries for other keys when a new entry is stored', async () => {
    vi.useFakeTimers();
    const cache = createTtlCache<string>(1000);
    await cache.get('token-1', async () => 'one');
    await cache.get('token-2', async () => 'two');
    expect(cache.size()).toBe(2);
    vi.advanceTimersByTime(1001);
    // A rotated OAuth token is a brand-new key; storing it must drop the two stale identities.
    await cache.get('token-3', async () => 'three');
    expect(cache.size()).toBe(1);
  });

  it('never holds more than maxEntries identities, dropping the least recently stored', async () => {
    const cache = createTtlCache<string>(60_000, 2);
    const fetchA = vi.fn().mockResolvedValue('a');
    await cache.get('a', fetchA);
    await cache.get('b', async () => 'b');
    await cache.get('c', async () => 'c');
    expect(cache.size()).toBe(2);
    // 'a' was evicted to make room for 'c', so asking for it again re-fetches.
    await cache.get('a', fetchA);
    expect(fetchA).toHaveBeenCalledTimes(2);
  });

  it('evicts a rejected fetch so the next call retries', async () => {
    const cache = createTtlCache<string>(60_000);
    await expect(cache.get('a', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(cache.size()).toBe(0);
    await expect(cache.get('a', async () => 'ok')).resolves.toBe('ok');
  });
});
