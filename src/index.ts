#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';
import { startHttpServer, requestContext } from './http.js';
import { parseArgs } from './args.js';

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
}

const { transport, host, port, portWasExplicit, filterOptions } = parsed;

const url = process.env['FIREFLY_URL'];

if (transport === 'http') {
  const oauthClientId = process.env['FIREFLY_OAUTH_CLIENT_ID'];
  if (!url || !oauthClientId) {
    process.stderr.write(
      'Error: FIREFLY_URL and FIREFLY_OAUTH_CLIENT_ID environment variables are required for HTTP transport.\n' +
      'See .env.example for configuration instructions.\n'
    );
    process.exit(1);
  }
  const client = new FireflyClient(url, () => {
    const store = requestContext.getStore();
    if (!store) throw new Error('No request context — Bearer token was not set before this call');
    return store.token;
  });
  await startHttpServer(() => createServer(client, filterOptions), host, port, portWasExplicit, oauthClientId, url);
} else {
  const token = process.env['FIREFLY_TOKEN'];
  if (!url || !token) {
    process.stderr.write(
      'Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required for stdio transport.\n' +
      'See .env.example for configuration instructions.\n'
    );
    process.exit(1);
  }
  const client = new FireflyClient(url, token);
  const server = createServer(client, filterOptions);
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
