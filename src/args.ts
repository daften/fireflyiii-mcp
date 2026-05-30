import { PRESETS, type PresetName, TOOL_GROUPS, type ToolFilterOptions, type ToolGroup } from './tools/index.js';

export interface ParsedArgs {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  portWasExplicit: boolean;
  filterOptions: ToolFilterOptions;
}

export function parseArgs(args: string[]): ParsedArgs {
  let transport: 'stdio' | 'http' = 'stdio';
  let host = '127.0.0.1';
  let port = 3000;
  let portWasExplicit = false;
  let preset: PresetName | undefined;
  let groups: ToolGroup[] | undefined;
  let readOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--transport' && args[i + 1]) {
      const val = args[++i];
      if (val !== 'stdio' && val !== 'http') {
        throw new Error(`--transport must be "stdio" or "http", got "${val}"`);
      }
      transport = val;
    } else if (arg === '--host' && args[i + 1]) {
      host = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error('--port must be a valid port number (1–65535)');
      }
      port = parsed;
      portWasExplicit = true;
    } else if (arg === '--preset' && args[i + 1]) {
      const val = args[++i];
      if (!(val in PRESETS)) {
        throw new Error(`Unknown preset "${val}". Valid presets: ${Object.keys(PRESETS).join(', ')}`);
      }
      preset = val as PresetName;
    } else if (arg === '--groups' && args[i + 1]) {
      const parts = args[++i]
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      for (const g of parts) {
        if (!(TOOL_GROUPS as readonly string[]).includes(g)) {
          throw new Error(`Unknown group "${g}". Valid groups: ${TOOL_GROUPS.join(', ')}`);
        }
      }
      groups = parts as ToolGroup[];
    } else if (arg === '--read-only') {
      readOnly = true;
    }
  }

  if (preset === undefined && process.env.MCP_PRESET) {
    const val = process.env.MCP_PRESET.trim();
    if (!(val in PRESETS)) {
      throw new Error(`Unknown preset "${val}" from MCP_PRESET. Valid presets: ${Object.keys(PRESETS).join(', ')}`);
    }
    preset = val as PresetName;
  }

  if (groups === undefined && process.env.MCP_GROUPS) {
    const parts = process.env.MCP_GROUPS.split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    for (const g of parts) {
      if (!(TOOL_GROUPS as readonly string[]).includes(g)) {
        throw new Error(`Unknown group "${g}" from MCP_GROUPS. Valid groups: ${TOOL_GROUPS.join(', ')}`);
      }
    }
    groups = parts as ToolGroup[];
  }

  if (!readOnly && process.env.MCP_READ_ONLY === 'true') {
    readOnly = true;
  }

  if (preset !== undefined && groups !== undefined) {
    throw new Error('Cannot use both --preset and --groups. Choose one.');
  }

  const filterOptions: ToolFilterOptions = {};
  if (preset !== undefined) filterOptions.preset = preset;
  if (groups !== undefined) filterOptions.groups = groups;
  if (readOnly) filterOptions.readOnly = true;

  return { transport, host, port, portWasExplicit, filterOptions };
}
