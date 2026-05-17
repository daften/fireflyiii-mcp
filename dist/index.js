#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';
import { startHttpServer } from './http.js';
function parseArgs() {
    const args = process.argv.slice(2);
    let transport = 'stdio';
    let host = '127.0.0.1';
    let port = 3000;
    let portWasExplicit = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--transport' && args[i + 1]) {
            const val = args[++i];
            if (val !== 'stdio' && val !== 'http') {
                process.stderr.write(`Error: --transport must be "stdio" or "http", got "${val}"\n`);
                process.exit(1);
            }
            transport = val;
        }
        else if (args[i] === '--host' && args[i + 1]) {
            host = args[++i];
        }
        else if (args[i] === '--port' && args[i + 1]) {
            const parsed = parseInt(args[++i], 10);
            if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
                process.stderr.write('Error: --port must be a valid port number (1–65535)\n');
                process.exit(1);
            }
            port = parsed;
            portWasExplicit = true;
        }
    }
    return { transport, host, port, portWasExplicit };
}
const { transport, host, port, portWasExplicit } = parseArgs();
const url = process.env['FIREFLY_URL'];
const token = process.env['FIREFLY_TOKEN'];
if (!url || !token) {
    process.stderr.write('Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required.\n' +
        'See .env.example for configuration instructions.\n');
    process.exit(1);
}
const client = new FireflyClient(url, token);
const server = createServer(client);
if (transport === 'http') {
    await startHttpServer(server, host, port, portWasExplicit);
}
else {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
}
//# sourceMappingURL=index.js.map