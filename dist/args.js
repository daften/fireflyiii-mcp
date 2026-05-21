import { TOOL_GROUPS, PRESETS } from './tools/index.js';
export function parseArgs(args) {
    let transport = 'stdio';
    let host = '127.0.0.1';
    let port = 3000;
    let portWasExplicit = false;
    let preset;
    let groups;
    let readOnly = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--transport' && args[i + 1]) {
            const val = args[++i];
            if (val !== 'stdio' && val !== 'http') {
                throw new Error(`--transport must be "stdio" or "http", got "${val}"`);
            }
            transport = val;
        }
        else if (arg === '--host' && args[i + 1]) {
            host = args[++i];
        }
        else if (arg === '--port' && args[i + 1]) {
            const parsed = parseInt(args[++i], 10);
            if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
                throw new Error('--port must be a valid port number (1–65535)');
            }
            port = parsed;
            portWasExplicit = true;
        }
        else if (arg === '--preset' && args[i + 1]) {
            const val = args[++i];
            if (!(val in PRESETS)) {
                throw new Error(`Unknown preset "${val}". Valid presets: ${Object.keys(PRESETS).join(', ')}`);
            }
            preset = val;
        }
        else if (arg === '--groups' && args[i + 1]) {
            const parts = args[++i].split(',').map((g) => g.trim()).filter(Boolean);
            for (const g of parts) {
                if (!TOOL_GROUPS.includes(g)) {
                    throw new Error(`Unknown group "${g}". Valid groups: ${TOOL_GROUPS.join(', ')}`);
                }
            }
            groups = parts;
        }
        else if (arg === '--read-only') {
            readOnly = true;
        }
    }
    if (preset !== undefined && groups !== undefined) {
        throw new Error('Cannot use both --preset and --groups. Choose one.');
    }
    const filterOptions = {};
    if (preset !== undefined)
        filterOptions.preset = preset;
    if (groups !== undefined)
        filterOptions.groups = groups;
    if (readOnly)
        filterOptions.readOnly = true;
    return { transport, host, port, portWasExplicit, filterOptions };
}
//# sourceMappingURL=args.js.map