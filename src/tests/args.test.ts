import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../args.js';

describe('parseArgs — filter flags', () => {
  it('returns empty filterOptions when no filter flags given', () => {
    const result = parseArgs([]);
    expect(result.filterOptions).toEqual({});
  });

  it('parses --preset', () => {
    const result = parseArgs(['--preset', 'default']);
    expect(result.filterOptions.preset).toBe('default');
  });

  it('parses --read-only', () => {
    const result = parseArgs(['--read-only']);
    expect(result.filterOptions.readOnly).toBe(true);
  });

  it('parses --groups as a comma-separated list', () => {
    const result = parseArgs(['--groups', 'accounts,transactions']);
    expect(result.filterOptions.groups).toEqual(['accounts', 'transactions']);
  });

  it('parses single --groups value', () => {
    const result = parseArgs(['--groups', 'rules']);
    expect(result.filterOptions.groups).toEqual(['rules']);
  });

  it('throws when both --preset and --groups are provided', () => {
    expect(() => parseArgs(['--preset', 'default', '--groups', 'accounts'])).toThrow(
      /cannot use both --preset and --groups/i,
    );
  });

  it('throws when unknown preset name is provided', () => {
    expect(() => parseArgs(['--preset', 'nonexistent'])).toThrow(/unknown preset/i);
  });

  it('throws when unknown group name is provided', () => {
    expect(() => parseArgs(['--groups', 'accounts,fakething'])).toThrow(/unknown group.*fakething/i);
  });

  it('parses --read-only alongside --preset', () => {
    const result = parseArgs(['--preset', 'minimal', '--read-only']);
    expect(result.filterOptions.preset).toBe('minimal');
    expect(result.filterOptions.readOnly).toBe(true);
  });

  it('parses --read-only alongside --groups', () => {
    const result = parseArgs(['--groups', 'rules,recurring', '--read-only']);
    expect(result.filterOptions.groups).toEqual(['rules', 'recurring']);
    expect(result.filterOptions.readOnly).toBe(true);
  });
});

describe('parseArgs — existing flags still work', () => {
  it('parses --transport http', () => {
    const result = parseArgs(['--transport', 'http']);
    expect(result.transport).toBe('http');
  });

  it('parses --host and --port', () => {
    const result = parseArgs(['--host', '0.0.0.0', '--port', '4000']);
    expect(result.host).toBe('0.0.0.0');
    expect(result.port).toBe(4000);
    expect(result.portWasExplicit).toBe(true);
  });

  it('throws on invalid --transport value', () => {
    expect(() => parseArgs(['--transport', 'grpc'])).toThrow(/--transport must be/i);
  });

  it('throws on invalid --port value', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/--port must be/i);
  });
});

describe('parseArgs — environment variables fallbacks', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MCP_PRESET;
    delete process.env.MCP_GROUPS;
    delete process.env.MCP_READ_ONLY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to MCP_PRESET when --preset is omitted', () => {
    process.env.MCP_PRESET = 'minimal';
    const result = parseArgs([]);
    expect(result.filterOptions.preset).toBe('minimal');
  });

  it('CLI --preset overrides MCP_PRESET', () => {
    process.env.MCP_PRESET = 'minimal';
    const result = parseArgs(['--preset', 'default']);
    expect(result.filterOptions.preset).toBe('default');
  });

  it('falls back to MCP_GROUPS when --groups is omitted', () => {
    process.env.MCP_GROUPS = 'rules,recurring';
    const result = parseArgs([]);
    expect(result.filterOptions.groups).toEqual(['rules', 'recurring']);
  });

  it('CLI --groups overrides MCP_GROUPS', () => {
    process.env.MCP_GROUPS = 'rules,recurring';
    const result = parseArgs(['--groups', 'accounts']);
    expect(result.filterOptions.groups).toEqual(['accounts']);
  });

  it('falls back to MCP_READ_ONLY when --read-only is omitted', () => {
    process.env.MCP_READ_ONLY = 'true';
    const result = parseArgs([]);
    expect(result.filterOptions.readOnly).toBe(true);
  });

  it('CLI --read-only takes precedence even if MCP_READ_ONLY is false/unset', () => {
    process.env.MCP_READ_ONLY = 'false';
    const result = parseArgs(['--read-only']);
    expect(result.filterOptions.readOnly).toBe(true);
  });

  it('throws on invalid MCP_PRESET', () => {
    process.env.MCP_PRESET = 'nonexistent';
    expect(() => parseArgs([])).toThrow(/unknown preset/i);
  });

  it('throws on invalid MCP_GROUPS', () => {
    process.env.MCP_GROUPS = 'accounts,fakething';
    expect(() => parseArgs([])).toThrow(/unknown group.*fakething/i);
  });

  it('throws if both CLI preset and env groups are provided', () => {
    process.env.MCP_GROUPS = 'accounts';
    expect(() => parseArgs(['--preset', 'default'])).toThrow(/cannot use both --preset and --groups/i);
  });
});
