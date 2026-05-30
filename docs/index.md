---
layout: home

hero:
  name: fireflyiii-mcp
  tagline: Connect any MCP-compatible AI assistant to your Firefly III personal finance instance. Query your finances in natural language — no queries, no code.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/daften/fireflyiii-mcp
    - theme: alt
      text: Docker (GHCR)
      link: https://github.com/daften/fireflyiii-mcp/pkgs/container/fireflyiii-mcp

features:
  - icon: 🛠️
    title: 140 tools
    details: 14 groups covering accounts, transactions, budgets, categories, bills, piggy banks, reports, rules, recurring transactions, attachments, currencies, exports, object groups, and transaction links.
  - icon: 🔌
    title: stdio & HTTP
    details: Connect locally via Personal Access Token (stdio), or self-host with OAuth 2.0 for remote access from any MCP-compatible client.
  - icon: 🎛️
    title: Tool filtering
    details: Load only what you need. Choose a named preset or pick individual groups. Add --read-only to restrict to safe, non-destructive tools.
  - icon: 🐳
    title: Docker ready
    details: Run as a self-hosted container. Pull from GHCR and connect any MCP-compatible AI assistant remotely over HTTP.
---

## What you can ask

Once configured, ask your AI assistant things like:

> *"How much did I spend on groceries last month?"*

> *"Find any duplicate transactions in the last 30 days."*

> *"Set up a piggy bank for my vacation fund with a €2000 target, linked to my savings account."*

> *"Which bills are coming up this week and am I on track?"*

> *"What were my biggest expense categories this year?"*

Your AI handles the Firefly III API calls — you get plain-language answers.

## Quickstart

The simplest setup uses `npx` with stdio transport and a Personal Access Token (PAT).

**Step 1:** Create a PAT in Firefly III: **Options → Remote access and tokens → Create new token**

**Step 2:** Add to your MCP client config:

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

Your AI assistant downloads and starts the server automatically on first use. → [Full stdio guide](/guide/stdio)

## All setup options

| Method | Transport | Best for |
|--------|-----------|----------|
| [npm — stdio](/guide/stdio) | stdio | Simplest setup, AI on the same machine |
| [npm — HTTP/OAuth](/guide/http-oauth) | HTTP + OAuth 2.0 | Remote AI access, OAuth instead of PAT |
| [Docker — HTTP](/guide/docker) | HTTP + OAuth 2.0 | Self-hosted on a server or home lab |
| [Git checkout](/guide/git-checkout) | stdio or HTTP | Contributing or local development |
