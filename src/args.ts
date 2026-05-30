import { PRESETS, type PresetName, TOOL_GROUPS, type ToolFilterOptions, type ToolGroup } from './tools/index.js';

export interface ParsedArgs {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  portWasExplicit: boolean;
  filterOptions: ToolFilterOptions;
}

/**
 * Validate a preset name from either a CLI flag or an environment variable.
 * `source` is appended to the error message (e.g. " from MCP_PRESET") to make
 * misconfiguration easy to trace; pass "" for CLI flags.
 */
function validatePreset(val: string, source = ''): PresetName {
  if (!(val in PRESETS)) {
    throw new Error(`Unknown preset "${val}"${source}. Valid presets: ${Object.keys(PRESETS).join(', ')}`);
  }
  return val as PresetName;
}

/**
 * Parse a comma-separated group list from a CLI flag or environment variable.
 * Whitespace and empty entries are ignored; an unknown group throws. Returns
 * an empty array when the input contains no usable group names.
 */
function parseGroups(raw: string, source = ''): ToolGroup[] {
  const parts = raw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  for (const g of parts) {
    if (!(TOOL_GROUPS as readonly string[]).includes(g)) {
      throw new Error(`Unknown group "${g}"${source}. Valid groups: ${TOOL_GROUPS.join(', ')}`);
    }
  }
  return parts as ToolGroup[];
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
      preset = validatePreset(args[++i]);
    } else if (arg === '--groups' && args[i + 1]) {
      groups = parseGroups(args[++i]);
    } else if (arg === '--read-only') {
      readOnly = true;
    }
  }

  // Environment-variable fallbacks. CLI flags always take precedence: each is
  // consulted only when the corresponding flag was omitted.
  if (preset === undefined && process.env.MCP_PRESET?.trim()) {
    preset = validatePreset(process.env.MCP_PRESET.trim(), ' from MCP_PRESET');
  }

  if (groups === undefined && process.env.MCP_GROUPS) {
    const parsed = parseGroups(process.env.MCP_GROUPS, ' from MCP_GROUPS');
    // An empty/whitespace-only value (e.g. "," or "  ") is treated as unset
    // rather than "select no groups", which would silently register no tools.
    if (parsed.length > 0) groups = parsed;
  }

  if (!readOnly) {
    const flag = process.env.MCP_READ_ONLY?.trim().toLowerCase();
    if (flag === 'true' || flag === '1') readOnly = true;
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
