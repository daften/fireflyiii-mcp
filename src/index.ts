#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';

const url = process.env['FIREFLY_URL'];
const token = process.env['FIREFLY_TOKEN'];

if (!url || !token) {
  process.stderr.write(
    'Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required.\n' +
    'See .env.example for configuration instructions.\n'
  );
  process.exit(1);
}

const client = new FireflyClient(url, token);
const server = createServer(client);
const transport = new StdioServerTransport();

await server.connect(transport);
