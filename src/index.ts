#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type ParsedArgs, parseArgs } from './args.js';
import { FireflyClient } from './client.js';
import { requestContext, startHttpServer } from './http.js';
import { createServer } from './server.js';

let parsed: ParsedArgs;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  process.exit(1);
}

const { transport, host, port, portWasExplicit, filterOptions } = parsed;

const url = process.env.FIREFLY_URL;

if (transport === 'http') {
  // FIREFLY_OAUTH_CLIENT_ID is optional: when unset, the server runs in PAT-only
  // mode (no OAuth proxy surface) and expects a Firefly III Personal Access Token
  // as the per-request Bearer token instead.
  const oauthClientId = process.env.FIREFLY_OAUTH_CLIENT_ID;
  if (!url) {
    process.stderr.write(
      'Error: FIREFLY_URL environment variable is required for HTTP transport.\n' +
        'See .env.example for configuration instructions.\n',
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
  const token = process.env.FIREFLY_TOKEN;
  if (!url || !token) {
    process.stderr.write(
      'Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required for stdio transport.\n' +
        'See .env.example for configuration instructions.\n',
    );
    process.exit(1);
  }
  const client = new FireflyClient(url, token);
  const server = createServer(client, filterOptions);
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
