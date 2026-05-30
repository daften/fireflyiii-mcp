# MCP server for Firefly III

[![npm version](https://img.shields.io/npm/v/@daften/fireflyiii-mcp.svg)](https://www.npmjs.com/package/@daften/fireflyiii-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@daften/fireflyiii-mcp.svg)](https://www.npmjs.com/package/@daften/fireflyiii-mcp)
[![CI](https://github.com/daften/fireflyiii-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/daften/fireflyiii-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-daften.github.io-blue)](https://daften.github.io/fireflyiii-mcp/)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects any MCP-compatible AI assistant to your [Firefly III](https://www.firefly-iii.org) personal finance instance. Ask your AI assistant questions about your finances in natural language.
📖 **[Full documentation → daften.github.io/fireflyiii-mcp](https://daften.github.io/fireflyiii-mcp/)**

## What you can ask

Once configured, you can ask things like:

- *"How much did I spend on groceries last month?"*
- *"Show me my budget status for this month."*
- *"Find any duplicate transactions in the last 30 days."*
- *"Set up a piggy bank for my vacation fund with a €2000 target."*
- *"What were my biggest expense categories this year?"*

Your AI assistant handles the Firefly III API calls — you get answers in plain language.

---

Choose your setup method:

| Method | Transport | Best for |
|--------|-----------|----------|
| [npm — stdio](#option-1-npm-package--stdio-simplest) | stdio | Simplest setup, AI on the same machine |
| [npm — HTTP](#option-2-npm-package--http-oauth) | HTTP + OAuth | Remote AI access or when you prefer OAuth over a PAT |
| [Docker — HTTP](#option-3-docker--http-self-hosted) | HTTP + OAuth | Self-hosted on a server or home lab |
| [Git checkout](#option-4-git-checkout-development) | stdio or HTTP | Contributing or local development |

---

## Option 1: npm package — stdio (simplest)

**Requires:** Node.js 20+, a Firefly III Personal Access Token (Options → Remote access and tokens → Create new token).

Add to your Claude MCP config (`.claude/mcp.json` or Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "npx",
      "args": ["-y", "@daften/fireflyiii-mcp"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

Your MCP client downloads and starts the server automatically on first use. No separate install step needed.

---

## Option 2: npm package — HTTP (OAuth)

→ See [HTTP/OAuth setup guide](https://daften.github.io/fireflyiii-mcp/guide/http-oauth) in the docs.

---

## Option 3: Docker — HTTP (self-hosted)

→ See [Docker setup guide](https://daften.github.io/fireflyiii-mcp/guide/docker) in the docs.

---

## Option 4: Git checkout (development)

→ See [Git checkout guide](https://daften.github.io/fireflyiii-mcp/guide/git-checkout) in the docs.

---

## Experimental Autocomplete Prompts

→ See [Autocomplete prompts](https://daften.github.io/fireflyiii-mcp/reference/autocomplete) in the docs.

---

## Available Tools

→ See the full [tool reference](https://daften.github.io/fireflyiii-mcp/reference/tools) in the docs (140 tools across 14 groups).

---

## Filtering Tools

→ See [Tool filtering](https://daften.github.io/fireflyiii-mcp/reference/filtering) in the docs.

---

## Development

```bash
npm test                  # Run unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Run against live Firefly III (requires FIREFLY_URL + FIREFLY_TOKEN)
npm run dev               # Run without building (uses tsx)
npm run build             # Compile TypeScript to dist/
```

## Resources

- [Firefly III API Documentation](https://api-docs.firefly-iii.org/) — interactive Swagger UI for all API versions
- [Firefly III OpenAPI YAML](https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml) — machine-readable spec; fetch with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` (direct browser access blocked by bot protection)
- [Firefly III Docs](https://docs.firefly-iii.org/)
- [MCP Documentation](https://modelcontextprotocol.io/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, tool-add checklist, and commit conventions.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

## Acknowledgements

Feature comparison informed by [fabianonetto/mcp-server-firefly-iii](https://github.com/fabianonetto/mcp-server-firefly-iii) and [etnperlong/firefly-iii-mcp](https://github.com/etnperlong/firefly-iii-mcp).

## License

MIT
