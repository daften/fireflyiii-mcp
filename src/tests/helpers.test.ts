import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FireflyError } from '../client.js';
import { defineTool, dateSchema } from '../tools/_helpers.js';

function makeServer() {
  let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
  const server = {
    registerTool: vi.fn((_name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      capturedHandler = handler;
    }),
    getHandler: () => capturedHandler!,
  };
  return server;
}

describe('defineTool', () => {
  it('serialises object result to pretty-printed JSON', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => ({ foo: 'bar', n: 1 }));
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: '{\n  "foo": "bar",\n  "n": 1\n}' }],
    });
  });

  it('passes string result through without double-encoding', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => 'col1,col2\n1,2');
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'col1,col2\n1,2' }],
    });
  });

  it('wraps thrown FireflyError into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => { throw new FireflyError(404, '/test', ''); });
    const result = await server.getHandler()({});
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Resource not found.' }],
    });
  });

  it('wraps generic Error into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => { throw new Error('boom'); });
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
