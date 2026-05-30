# Git checkout (development)

Use this setup when contributing to `fireflyiii-mcp` or running a local development build.

## Setup

```bash
git clone https://github.com/daften/fireflyiii-mcp.git
cd fireflyiii-mcp
npm install
npm run build
```

## stdio mode

Create `.env` from `.env.example`:

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_TOKEN=your-personal-access-token-here
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "node",
      "args": ["/absolute/path/to/fireflyiii-mcp/dist/index.js"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

Use `npm run dev` instead of `node dist/index.js` during development to skip the build step.

## HTTP mode

Register an OAuth client in Firefly III as described in the [HTTP/OAuth guide](./http-oauth), then add to `.env`:

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_OAUTH_CLIENT_ID=your-client-id-here
```

Start the server:

```bash
npm run dev -- --transport http
# or after building:
node dist/index.js --transport http
```

Connect your AI client as in [Step 3 of the HTTP/OAuth guide](./http-oauth#step-3-connect-your-ai-client).

## Running tests

```bash
npm test                  # Unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Against a live Firefly III instance (requires .env.test)
```
