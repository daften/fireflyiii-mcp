import { PRESETS, type PresetName, TOOL_GROUPS, type ToolFilterOptions, type ToolGroup } from './tools/index.js';

export interface ParsedArgs {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  portWasExplicit: boolean;
  filterOptions: ToolFilterOptions;
}

const VALUE_FLAGS = ['--transport', '--host', '--port', '--preset', '--groups'] as const;
const BOOLEAN_FLAGS = ['--read-only'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

/** Validate a preset name. Own keys only: `toString` or `__proto__` must not pass via the prototype. */
function validatePreset(val: string, source = ''): PresetName {
  if (!Object.hasOwn(PRESETS, val)) {
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

/** Suggest the flag a typo was probably meant to be, e.g. `--readonly` → `--read-only`. */
function suggestFlag(arg: string): string {
  const normalize = (s: string) => s.replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();
  const match = [...VALUE_FLAGS, ...BOOLEAN_FLAGS].find((flag) => normalize(flag) === normalize(arg.split('=')[0]));
  return match ? ` Did you mean ${match}?` : '';
}

/**
 * Parse CLI arguments. Anything not recognized is an error rather than being skipped: a mistyped
 * `--read-only` used to start the server with full write access and no warning.
 */
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
    if ((BOOLEAN_FLAGS as readonly string[]).includes(arg)) {
      readOnly = true;
      continue;
    }

    // Accept both `--flag value` and `--flag=value`.
    const eq = arg.indexOf('=');
    const flag = (eq === -1 ? arg : arg.slice(0, eq)) as ValueFlag;
    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) {
      throw new Error(
        `Unknown argument "${arg}".${suggestFlag(arg)} Valid flags: ${[...VALUE_FLAGS, ...BOOLEAN_FLAGS].join(', ')}`,
      );
    }
    let val: string | undefined;
    if (eq !== -1) {
      val = arg.slice(eq + 1);
    } else {
      val = args[i + 1];
      if (val === undefined || val.startsWith('--')) throw new Error(`${flag} requires a value`);
      i++;
    }
    if (val === '') throw new Error(`${flag} requires a value`);

    switch (flag) {
      case '--transport':
        if (val !== 'stdio' && val !== 'http') {
          throw new Error(`--transport must be "stdio" or "http", got "${val}"`);
        }
        transport = val;
        break;
      case '--host':
        host = val;
        break;
      case '--port': {
        const parsed = /^\d+$/.test(val) ? Number(val) : Number.NaN;
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          throw new Error(`--port must be a whole number between 1 and 65535, got "${val}"`);
        }
        port = parsed;
        portWasExplicit = true;
        break;
      }
      case '--preset':
        preset = validatePreset(val);
        break;
      case '--groups':
        groups = parseGroups(val);
        if (groups.length === 0) throw new Error('--groups needs at least one group name');
        break;
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
    // Unrecognized values are an error, not "off": MCP_READ_ONLY=yes must not quietly mean read-write.
    const flag = process.env.MCP_READ_ONLY?.trim().toLowerCase() ?? '';
    if (flag === 'true' || flag === '1') readOnly = true;
    else if (flag !== '' && flag !== 'false' && flag !== '0') {
      throw new Error(`MCP_READ_ONLY must be "true", "1", "false" or "0", got "${process.env.MCP_READ_ONLY}"`);
    }
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
