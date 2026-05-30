# Getting Started

`fireflyiii-mcp` is an MCP (Model Context Protocol) server that bridges any MCP-compatible AI assistant to your [Firefly III](https://www.firefly-iii.org) personal finance instance.

## Prerequisites

- A running Firefly III instance (self-hosted or cloud)
- An MCP-compatible AI client (Claude Code, Claude Desktop, or other)
- Node.js 20+ (for npm setups) **or** Docker (for the container setup)

## Choose your setup

| Method | Transport | Best for |
|--------|-----------|----------|
| [npm — stdio](./stdio) | stdio | Simplest. AI client and server on the same machine. |
| [npm — HTTP/OAuth](./http-oauth) | HTTP + OAuth 2.0 | AI client connecting remotely, prefers OAuth over a PAT. |
| [Docker — HTTP](./docker) | HTTP + OAuth 2.0 | Self-hosted on a home lab or server. |
| [Git checkout](./git-checkout) | stdio or HTTP | Contributing or local development. |

**Not sure which to pick?** Start with [npm — stdio](./stdio) — it's one config block and requires no server setup.

## How it works

The server exposes Firefly III's REST API as MCP tools. Your AI assistant calls these tools automatically when you ask finance-related questions. You never write API calls manually.

With 140 tools across 14 groups, you can optionally load only a subset to save context window space — see [Tool filtering](/reference/filtering).
