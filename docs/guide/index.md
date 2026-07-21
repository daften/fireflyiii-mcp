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

**Not sure which to pick?** Answer one question: can the machine running your AI client reach Firefly III directly?

- **Yes** → [npm — stdio](./stdio). One process, no server to host, no bridge.
- **No, but you can host this server publicly** → [Docker — HTTP](./docker) with OAuth. The only option where no client device stores a long-lived token.
- **No, and the server stays on your LAN/VPN** → host it over HTTP and bridge with `mcp-remote`.

Using Claude Desktop? See [Claude Desktop](./claude-desktop) — its config file does **not** accept HTTP servers.

## Nightly builds

Want to test unreleased changes from `main`? Install a [nightly build](./nightly) via the `@nightly` (npm) or `:nightly` (Docker) tag. Nightlies are unstable — a normal install always gives you the latest tagged release.

## How it works

The server exposes Firefly III's REST API as MCP tools. Your AI assistant calls these tools automatically when you ask finance-related questions. You never write API calls manually.

With 140 tools across 14 groups, you can optionally load only a subset to save context window space — see [Tool filtering](/reference/filtering).
