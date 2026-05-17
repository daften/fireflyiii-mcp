import * as http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

async function tryListen(
  httpServer: http.Server,
  host: string,
  port: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
}

export async function startHttpServer(
  server: McpServer,
  host: string,
  requestedPort: number,
  portWasExplicit: boolean
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  const httpServer = http.createServer(async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`HTTP request handler error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
  });

  let port = requestedPort;
  let moved = false;

  while (true) {
    try {
      await tryListen(httpServer, host, port);
      break;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EADDRINUSE') {
        throw err;
      }
      if (portWasExplicit) {
        process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
        process.exit(1);
      }
      const attempted = port - requestedPort;
      if (attempted >= 10) {
        process.stderr.write(
          `Error: Ports ${requestedPort}–${requestedPort + 10} on ${host} are all in use. Specify an available port with --port.\n`
        );
        process.exit(1);
      }
      port++;
      moved = true;
    }
  }

  httpServer.on('error', (err) => {
    process.stderr.write(`HTTP server error: ${err}\n`);
  });

  await server.connect(transport);

  process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
  if (moved) {
    process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
  }
}
