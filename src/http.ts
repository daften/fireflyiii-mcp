import * as http from 'node:http';
import * as net from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function startHttpServer(
  server: McpServer,
  host: string,
  requestedPort: number,
  portWasExplicit: boolean
): Promise<void> {
  let port = requestedPort;
  let moved = false;

  if (!(await isPortAvailable(host, port))) {
    if (portWasExplicit) {
      process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
      process.exit(1);
    }
    const originalPort = port;
    let found = false;
    for (let i = 1; i <= 10; i++) {
      port = originalPort + i;
      if (await isPortAvailable(host, port)) {
        moved = true;
        found = true;
        break;
      }
    }
    if (!found) {
      process.stderr.write(
        `Error: Ports ${originalPort}–${originalPort + 10} on ${host} are all in use. Specify an available port with --port.\n`
      );
      process.exit(1);
    }
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
      if (moved) {
        process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
      }
      resolve();
    });
  });
}
