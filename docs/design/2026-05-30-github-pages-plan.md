# GitHub Pages Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a VitePress documentation site at `https://daften.github.io/fireflyiii-mcp/` with a landing page and full docs, served via GitHub Pages.

**Architecture:** VitePress lives in `docs/` at the project root with its own config. Content is Markdown adapted from the existing `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`. GitHub Actions builds and deploys to the `gh-pages` branch on every push to `main`.

**Tech Stack:** VitePress (latest 1.x), Node 20, `peaceiris/actions-gh-pages@v4`, GitHub Pages

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `package.json` | Add vitepress devDependency + docs scripts |
| Modify | `.gitignore` | Exclude VitePress build output |
| Create | `docs/.vitepress/config.ts` | VitePress config: nav, sidebar, base URL |
| Create | `docs/index.md` | Landing page (home layout) |
| Create | `docs/guide/index.md` | Overview & prerequisites |
| Create | `docs/guide/stdio.md` | Setup: npm + stdio |
| Create | `docs/guide/http-oauth.md` | Setup: npm + HTTP/OAuth |
| Create | `docs/guide/docker.md` | Setup: Docker + HTTP |
| Create | `docs/guide/git-checkout.md` | Setup: git checkout (dev) |
| Create | `docs/reference/tools.md` | All 140 tools, 14 groups |
| Create | `docs/reference/filtering.md` | Presets, groups, read-only |
| Create | `docs/reference/autocomplete.md` | Experimental autocomplete prompts |
| Create | `docs/reference/env-vars.md` | All environment variables |
| Create | `docs/contributing/index.md` | Development setup |
| Create | `docs/contributing/new-tool.md` | Adding a new tool guide |
| Create | `.github/workflows/docs.yml` | Build + deploy to gh-pages |
| Modify | `README.md` | Add docs site badge and link |

---

## Task 1: VitePress scaffold

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `docs/.vitepress/config.ts`

- [ ] **Step 1: Install VitePress as a devDependency**

```bash
cd /path/to/fireflyiii-mcp
npm install -D vitepress
```

Expected: VitePress added to `devDependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Add docs scripts to `package.json`**

Add to the `"scripts"` block (after the existing `"test:integration"` line):

```json
"docs:dev": "vitepress dev docs",
"docs:build": "vitepress build docs",
"docs:preview": "vitepress preview docs"
```

- [ ] **Step 3: Exclude VitePress build dirs from git**

Add two lines to `.gitignore` (after the existing `dist/` line):

```
docs/.vitepress/dist
docs/.vitepress/cache
```

- [ ] **Step 4: Create `docs/.vitepress/config.ts`**

```typescript
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'fireflyiii-mcp',
  description:
    'Connect any MCP-compatible AI assistant to your Firefly III personal finance instance.',
  base: '/fireflyiii-mcp/',
  srcExclude: ['design/**'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/tools' },
      { text: 'Contributing', link: '/contributing/' },
      { text: 'GitHub', link: 'https://github.com/daften/fireflyiii-mcp' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/guide/' },
            { text: 'npm + stdio', link: '/guide/stdio' },
            { text: 'npm + HTTP/OAuth', link: '/guide/http-oauth' },
            { text: 'Docker + HTTP', link: '/guide/docker' },
            { text: 'Git checkout', link: '/guide/git-checkout' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Available tools', link: '/reference/tools' },
            { text: 'Tool filtering', link: '/reference/filtering' },
            { text: 'Autocomplete prompts', link: '/reference/autocomplete' },
            { text: 'Environment variables', link: '/reference/env-vars' },
          ],
        },
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Development setup', link: '/contributing/' },
            { text: 'Adding a new tool', link: '/contributing/new-tool' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/daften/fireflyiii-mcp' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/daften/fireflyiii-mcp/edit/main/docs/:path',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Dieter Blomme',
    },
  },
})
```

- [ ] **Step 5: Verify the dev server starts**

```bash
npm run docs:dev
```

Expected: output includes `vitepress v1.x.x` and `Local: http://localhost:5173/fireflyiii-mcp/`. Open the URL — you should see a blank VitePress site (no content yet, that's fine).

Stop the server with `Ctrl+C`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore docs/.vitepress/config.ts
git commit -m "chore: scaffold VitePress docs site

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Landing page

**Files:**
- Create: `docs/index.md`

- [ ] **Step 1: Create `docs/index.md`**

```markdown
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
```

- [ ] **Step 2: Verify in dev server**

```bash
npm run docs:dev
```

Open `http://localhost:5173/fireflyiii-mcp/`. You should see the hero section, 4 feature tiles, the "What you can ask" examples, the quickstart snippet, and the setup options table. Stop with `Ctrl+C`.

- [ ] **Step 3: Commit**

```bash
git add docs/index.md
git commit -m "docs: add landing page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Guide — Overview & prerequisites

**Files:**
- Create: `docs/guide/index.md`

- [ ] **Step 1: Create `docs/guide/index.md`**

```markdown
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
```

- [ ] **Step 2: Verify no build errors**

```bash
npm run docs:build
```

Expected: exits with code 0. Output is written to `docs/.vitepress/dist/`.

- [ ] **Step 3: Commit**

```bash
git add docs/guide/index.md
git commit -m "docs: add guide overview page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Guide — stdio setup

**Files:**
- Create: `docs/guide/stdio.md`

- [ ] **Step 1: Create `docs/guide/stdio.md`**

Adapted from README "Option 1: npm package — stdio".

```markdown
# npm + stdio (simplest)

**Requires:** Node.js 20+, a Firefly III Personal Access Token.

Get a PAT from Firefly III: **Options → Remote access and tokens → Create new token**.

## Step 1: Add to your MCP client config

For **Claude Code** (`.claude/mcp.json`) or **Claude Desktop** (`claude_desktop_config.json`):

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

Your AI assistant downloads and starts the server automatically on first use. No separate install step is needed.

## Optional: limit which tools are loaded

With 140 tools, loading everything uses significant context window space. Use `MCP_PRESET` to load a named subset:

```json
"env": {
  "FIREFLY_URL": "https://your-firefly-instance.example.com",
  "FIREFLY_TOKEN": "your-personal-access-token-here",
  "MCP_PRESET": "default",
  "MCP_READ_ONLY": "true"
}
```

See [Tool filtering](/reference/filtering) for all preset names and group options.

## Optional: install globally

```bash
npm install -g @daften/fireflyiii-mcp
```

Then replace `"command": "npx", "args": ["-y", "@daften/fireflyiii-mcp"]` with `"command": "fireflyiii-mcp"`.
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/guide/stdio.md
git commit -m "docs: add stdio setup guide

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Guide — HTTP/OAuth setup

**Files:**
- Create: `docs/guide/http-oauth.md`

- [ ] **Step 1: Create `docs/guide/http-oauth.md`**

Adapted from README "Option 2: npm package — HTTP (OAuth)".

```markdown
# npm + HTTP/OAuth

HTTP mode uses OAuth 2.0 (Authorization Code + PKCE) instead of a Personal Access Token. Your MCP client handles the OAuth flow automatically on first connection.

**Requires:** Node.js 20+.

## Step 1: Register an OAuth client in Firefly III

Go to **Options → Remote access and tokens → Create New Client**:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `MCP Server` |
| **Redirect URL** | `http://127.0.0.1:3000/oauth/callback` |
| **Keep a secret?** | **Uncheck this box** |

Save and copy the **Client ID**. You do not need the client secret.

::: tip Why uncheck "Keep a secret?"
Unchecking creates a *public client*, which uses a code verifier instead of a stored secret. This is the correct and secure choice for clients like AI assistants that cannot safely store a secret.
:::

::: tip Why this specific redirect URL?
MCP clients use a random port for their OAuth callback. This server acts as a proxy: it intercepts the request, substitutes its own stable callback URL, and forwards the authorization code back. Register this URL once.
:::

## Step 2: Start the server

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
npx @daften/fireflyiii-mcp --transport http
```

To use a different port: add `--port 4000`.

## Step 3: Connect your AI client

```json
{
  "mcpServers": {
    "fireflyiii": {
      "type": "http",
      "url": "http://127.0.0.1:3000"
    }
  }
}
```

Or via the Claude Code CLI:

```bash
claude mcp add --transport http fireflyiii http://127.0.0.1:3000
```

::: warning
The `type: "http"` field is required. Without it, Claude Code assumes stdio and fails to connect.
:::

On first connection your AI client opens a browser to authorize with Firefly III. Tokens are managed automatically after that.

## OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required), which returns RFC 8414 metadata. MCP clients use this to discover OAuth endpoints automatically.
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/guide/http-oauth.md
git commit -m "docs: add HTTP/OAuth setup guide

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Guide — Docker setup

**Files:**
- Create: `docs/guide/docker.md`

- [ ] **Step 1: Create `docs/guide/docker.md`**

Adapted from README "Option 3: Docker — HTTP".

```markdown
# Docker + HTTP (self-hosted)

Docker runs in HTTP mode only. Suitable for hosting on a server or home lab where your AI client connects over the network.

The container image is published to GitHub Container Registry:
**[ghcr.io/daften/fireflyiii-mcp](https://github.com/daften/fireflyiii-mcp/pkgs/container/fireflyiii-mcp)**

## Step 1: Register an OAuth client in Firefly III

Go to **Options → Remote access and tokens → Create New Client**:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `MCP Server` |
| **Redirect URL** | `https://mcp.example.com/oauth/callback` |
| **Keep a secret?** | **Uncheck** |

Replace `https://mcp.example.com` with your actual `MCP_BASE_URL`.

## Step 2: Run the container

```bash
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

`MCP_BASE_URL` is the externally reachable URL of your container, used to build OAuth redirect URIs. If omitted, the server falls back to the `Host` request header, which is unreliable behind a reverse proxy.

### Limit which tools are loaded

```bash
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -e MCP_PRESET=default \
  -e MCP_READ_ONLY=true \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

See [Tool filtering](/reference/filtering) for the full list of presets and groups.

### With docker-compose

Copy `docker-compose.yml` from the repository:

```bash
# Option A: use a .env file
cp .env.example .env   # then edit .env
docker compose up -d

# Option B: export variables in your shell
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

::: warning Single replica only
OAuth state is held in-process. Run only one container replica — multiple replicas will break the OAuth flow because the callback may land on a different instance than the one that initiated authorization.
:::

## Step 3: Connect your AI client

```json
{
  "mcpServers": {
    "fireflyiii": {
      "type": "http",
      "url": "https://mcp.example.com"
    }
  }
}
```
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/guide/docker.md
git commit -m "docs: add Docker setup guide

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Guide — Git checkout

**Files:**
- Create: `docs/guide/git-checkout.md`

- [ ] **Step 1: Create `docs/guide/git-checkout.md`**

Adapted from README "Option 4: Git checkout".

```markdown
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
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/guide/git-checkout.md
git commit -m "docs: add git checkout setup guide

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Reference — Available tools

**Files:**
- Create: `docs/reference/tools.md`

- [ ] **Step 1: Create `docs/reference/tools.md`**

This page mirrors the "Available Tools" section of `README.md`. Copy the full content from `README.md` lines 288–564 (from `## Available Tools` through the `### Transaction Links` details block), then:

1. Change the top heading from `## Available Tools` to `# Available tools`
2. Remove the `<details>`/`<summary>` wrappers — expand all groups as flat `##` subsections instead (VitePress renders full content, no need to collapse)
3. Keep the `| Tool | Description |` tables exactly as-is

The page structure should be:

```markdown
# Available tools

140 tools across 14 groups. Use [Tool filtering](/reference/filtering) to load only what you need.

## Accounts

| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
... (7 tools)

## Transactions
... (8 tools)

## Budgets
... (12 tools)

## Categories
... (5 tools)

## Bills
... (5 tools)

## Piggy Banks
... (7 tools)

## Recurring Transactions
... (7 tools)

## Automation Rules
... (15 tools)

## Attachments
... (7 tools)

## Tags & Reports
... (37 tools)

## Currencies
... (8 tools)

## Data Export
... (9 tools)

## Object Groups
... (7 tools)

## Transaction Links
... (6 tools)
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/tools.md
git commit -m "docs: add tools reference page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Reference — Tool filtering

**Files:**
- Create: `docs/reference/filtering.md`

- [ ] **Step 1: Create `docs/reference/filtering.md`**

Adapted from README "Filtering Tools" section.

```markdown
# Tool filtering

With 140 tools across 14 groups, loading everything consumes significant context window space. Three flags let you control exactly which tools are registered.

## --preset \<name\>

Load a named subset of tool groups:

| Preset | Groups included | Tools |
|--------|----------------|-------|
| `minimal` | accounts, transactions | 15 |
| `default` | accounts, transactions, budgets, categories, bills | 37 |
| `budgeting` | accounts, transactions, budgets, categories, bills, piggy-banks | 44 |
| `insights` | accounts, transactions, categories, reports | 57 |
| `automation` | accounts, transactions, rules, recurring | 37 |
| `full` | all 14 groups | 140 |

```bash
node dist/index.js --preset default
npx @daften/fireflyiii-mcp --preset budgeting
```

## --groups \<list\>

Comma-separated list of specific groups. Cannot combine with `--preset`.

Valid group names: `accounts`, `transactions`, `budgets`, `categories`, `bills`, `piggy-banks`, `reports`, `rules`, `recurring`, `attachments`, `currencies`, `exports`, `object-groups`, `transaction-links`

```bash
node dist/index.js --groups accounts,transactions,reports
```

## --read-only

Filter any selection down to read-only tools (`get_*`, `search_*`, `test_*`). All create, update, delete, trigger, and upload tools are excluded. Can combine with `--preset` or `--groups`.

```bash
node dist/index.js --preset default --read-only
node dist/index.js --groups rules --read-only
```

Without any filter flags the server registers all 140 tools (equivalent to `--preset full`).

## Environment variable equivalents

Each flag has an environment variable fallback, useful for npm/stdio and Docker setups where there's no natural place to pass CLI flags. The CLI flag always takes precedence.

| Variable | Equivalent flag | Example |
|----------|-----------------|---------|
| `MCP_PRESET` | `--preset <name>` | `MCP_PRESET=default` |
| `MCP_GROUPS` | `--groups <list>` | `MCP_GROUPS=accounts,transactions` |
| `MCP_READ_ONLY` | `--read-only` | `MCP_READ_ONLY=true` (also accepts `1`) |

`MCP_PRESET` and `MCP_GROUPS` are mutually exclusive.

### In stdio MCP config

```json
"env": {
  "FIREFLY_URL": "https://your-firefly-instance.example.com",
  "FIREFLY_TOKEN": "your-personal-access-token-here",
  "MCP_PRESET": "default",
  "MCP_READ_ONLY": "true"
}
```

### In Docker

```bash
docker run \
  -e FIREFLY_URL=https://... \
  -e FIREFLY_OAUTH_CLIENT_ID=... \
  -e MCP_BASE_URL=https://... \
  -e MCP_PRESET=default \
  -e MCP_READ_ONLY=true \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/filtering.md
git commit -m "docs: add tool filtering reference page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Reference — Autocomplete prompts

**Files:**
- Create: `docs/reference/autocomplete.md`

- [ ] **Step 1: Create `docs/reference/autocomplete.md`**

Adapted from README "Experimental Autocomplete Prompts" section.

```markdown
# Autocomplete prompts

The server implements standard MCP Prompts with experimental autocomplete (completions) support for common parameters — accounts, budgets, and categories. This lets you select resources via interactive dropdowns instead of guessing numeric database IDs.

::: warning Experimental
Autocomplete is implemented using MCP Prompts, not standard tool arguments. Support depends heavily on your MCP client:

- **Supported:** Claude Code (renders prompt dropdown completions during form-filling)
- **Not supported:** Claude Desktop App (does not render autocomplete dropdowns for MCP Prompts)
:::

## Available prompts

| Prompt | Description |
|--------|-------------|
| `account-transactions` | Transactions for a specific account. Autocompletes account name across all account types. |
| `budget-transactions` | Transactions for a specific budget. Autocompletes budget name. |
| `category-transactions` | Transactions for a specific category. Autocompletes category name. |

## How to use (Claude Code)

1. Click the **`+`** icon in the Claude Code prompt input
2. Select a prompt (e.g. `account-transactions`)
3. Start typing to filter and select from the dropdown

## Performance

Suggestions are pre-fetched (up to 1,000 records) and cached in memory for 60 seconds, returning the top 100 matches per keystroke. The cache is scoped per authenticated user, so it is safe for multi-user HTTP/OAuth deployments.

Set `FIREFLY_DEBUG=true` to log autocomplete cache activity to stderr.
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/autocomplete.md
git commit -m "docs: add autocomplete prompts reference page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Reference — Environment variables

**Files:**
- Create: `docs/reference/env-vars.md`

- [ ] **Step 1: Create `docs/reference/env-vars.md`**

Adapted from the "Environment Variables" section in `AGENTS.md`.

```markdown
# Environment variables

Store credentials in a `.env` file (gitignored). Copy `.env.example` from the repository as a starting point.

## stdio transport

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLY_URL` | Yes | Base URL of your Firefly III instance. No trailing slash. |
| `FIREFLY_TOKEN` | Yes | Personal Access Token from Firefly III Options → Remote access and tokens → Create new token. |

## HTTP transport

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLY_URL` | Yes | Base URL of your Firefly III instance. No trailing slash. |
| `FIREFLY_OAUTH_CLIENT_ID` | Yes | OAuth client ID from Firefly III Options → Remote access and tokens → Create New Client. |
| `MCP_BASE_URL` | Required when not on loopback | Public base URL of this server. Used to build OAuth redirect URIs. Required when hosting on a server; omit for local `127.0.0.1` setups. |

In HTTP mode, `FIREFLY_TOKEN` is not used. The Bearer token is resolved per-request from the `Authorization` header after the OAuth flow.

## Tool filtering (both transports)

| Variable | Equivalent CLI flag | Description |
|----------|---------------------|-------------|
| `MCP_PRESET` | `--preset <name>` | Named tool subset. See [Tool filtering](/reference/filtering). Mutually exclusive with `MCP_GROUPS`. |
| `MCP_GROUPS` | `--groups <list>` | Comma-separated group names. Mutually exclusive with `MCP_PRESET`. |
| `MCP_READ_ONLY` | `--read-only` | Set to `true` or `1` (case-insensitive) to restrict to read-only tools. |

The CLI flag always takes precedence over its environment variable equivalent.

## Debug

| Variable | Description |
|----------|-------------|
| `FIREFLY_DEBUG` | Set to `true` or `1` to emit verbose autocomplete tracing to stderr. Off by default. |
```

- [ ] **Step 2: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/env-vars.md
git commit -m "docs: add environment variables reference page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Contributing pages

**Files:**
- Create: `docs/contributing/index.md`
- Create: `docs/contributing/new-tool.md`

- [ ] **Step 1: Create `docs/contributing/index.md`**

Adapted from `CONTRIBUTING.md`.

```markdown
# Development setup

## Clone and install

```bash
git clone https://github.com/daften/fireflyiii-mcp.git
cd fireflyiii-mcp
npm install
```

## Development loop

```bash
npm test             # Run unit tests
npm run test:watch   # Watch mode
npm run build        # Compile TypeScript → dist/
```

Check TypeScript without building: `npx tsc --noEmit`.

## Running in dev mode (no build needed)

```bash
# stdio mode
npm run dev

# HTTP mode
npm run dev -- --transport http
```

Create `.env` from `.env.example` and fill in `FIREFLY_URL` and `FIREFLY_TOKEN` (or `FIREFLY_OAUTH_CLIENT_ID` for HTTP mode).

## Integration tests

Integration tests hit a live Firefly III instance. Copy `.env.example` to `.env.test`, fill in credentials, then:

```bash
npm run test:integration
```

These are skipped in CI. Run them manually before submitting changes to API-calling code.

## Commit conventions

```
feat:     New tool or feature
fix:      Bug fix
refactor: Code cleanup without behavior change
test:     Add or update tests
chore:    Dependencies, config, scaffolding
docs:     Documentation only
```

Subject line ≤72 characters. No period at the end.

## Releasing a new version

See [CONTRIBUTING.md](https://github.com/daften/fireflyiii-mcp/blob/main/CONTRIBUTING.md#releasing-a-new-version) in the repository for the full release process.
```

- [ ] **Step 2: Create `docs/contributing/new-tool.md`**

Adapted from `CONTRIBUTING.md` and the "Adding a New Tool" section of `AGENTS.md`.

```markdown
# Adding a new tool

## Overview

Each tool lives in a file under `src/tools/`. Each file exports a `registerXxxTools(server, client)` function that calls `server.registerTool()` for each tool it owns.

## Step 1: Check the Firefly III API spec

Before implementing, verify field names, required/optional status, and response shapes against the OpenAPI spec:

```bash
curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0" \
  | grep -A 100 "YourSchema:"
```

Field names in the docs summaries frequently differ from what the spec actually requires. The spec is authoritative.

## Step 2: Write a failing test

In `src/tests/{category}.test.ts`, add a test using a realistic JSON:API envelope fixture:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { fetchMyThing } from '../tools/my-category.js'
import type { JsonApiSingleResponse } from '../transform.js'

const fixture: JsonApiSingleResponse = {
  data: {
    id: '42',
    type: 'my-things',
    attributes: { name: 'Example', some_field: 'value' },
    links: {},
  },
}

describe('fetchMyThing', () => {
  it('returns flattened attributes with id', async () => {
    const mockClient = { get: vi.fn().mockResolvedValueOnce(fixture) } as any
    const result = await fetchMyThing(mockClient, '42')
    expect(mockClient.get).toHaveBeenCalledWith('/my-things/42', undefined)
    expect(result).toEqual({ name: 'Example', some_field: 'value', id: '42' })
  })
})
```

Run it to confirm it fails: `npm test -- --reporter=verbose src/tests/my-category.test.ts`

## Step 3: Implement the fetch function

In `src/tools/{category}.ts`:

```typescript
import { unwrapSingle, type JsonApiSingleResponse, type UnwrappedSingle } from '../transform.js'
import type { FireflyClient } from '../client.js'

export async function fetchMyThing(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/my-things/${id}`)
  return unwrapSingle(response)
}
```

Use `unwrapList` + `JsonApiListResponse` for list endpoints, `unwrapSingle` + `JsonApiSingleResponse` for single-item endpoints.

Run the test again to confirm it passes.

## Step 4: Register the tool

In the `registerXxxTools(server, client)` function of the same file:

```typescript
server.registerTool(
  'get_my_thing',
  {
    title: 'Get My Thing',
    description: 'Get a single my-thing by ID.',
    inputSchema: {
      id: z.string().describe('My-thing ID'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id }) => {
    try {
      const result = await fetchMyThing(client, id)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true }
    }
  }
)
```

Use `READ_ANNOTATIONS` for read-only tools. See `AGENTS.md` for write tool annotations.

## Step 5: Wire a new group (if creating a new tool file)

If the tool belongs to a new group file:

1. Add the group name to `TOOL_GROUPS` in `src/tools/index.ts`
2. Import and call `registerXxxTools` inside `registerAllTools`
3. Consider which presets it belongs in (`PRESETS` map in the same file)

## Step 6: Update docs

Add the tool to the table in `docs/reference/tools.md` and `README.md`.

## Step 7: Build and commit

```bash
npm run build    # verify TypeScript compiles
npm test         # verify all tests pass
git add src/tools/my-category.ts src/tests/my-category.test.ts docs/reference/tools.md README.md
git commit -m "feat: add get_my_thing tool"
```
```

- [ ] **Step 3: Verify build**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add docs/contributing/index.md docs/contributing/new-tool.md
git commit -m "docs: add contributing pages

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Create `.github/workflows/docs.yml`**

```yaml
name: Deploy docs

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build docs
        run: npm run docs:build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: docs/.vitepress/dist
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

```bash
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
try {
  yaml.load(fs.readFileSync('.github/workflows/docs.yml', 'utf8'));
  console.log('Valid YAML');
} catch (e) {
  console.error('Invalid YAML:', e.message);
  process.exit(1);
}
" 2>/dev/null || python3 -c "
import yaml, sys
with open('.github/workflows/docs.yml') as f:
    yaml.safe_load(f)
print('Valid YAML')
"
```

Expected: `Valid YAML`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci: add GitHub Actions workflow to build and deploy docs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 14: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add docs site badge and link to `README.md`**

After the existing badge line (the line with `[![npm version]...`), add a docs badge on the same line:

```markdown
[![Documentation](https://img.shields.io/badge/docs-daften.github.io-blue)](https://daften.github.io/fireflyiii-mcp/)
```

Then, immediately after the "An [MCP (Model Context Protocol)]..." opening sentence (line ~8 of the README), add a prominent link line:

```markdown
📖 **[Full documentation → daften.github.io/fireflyiii-mcp](https://daften.github.io/fireflyiii-mcp/)**
```

The README retains all its existing content — it should stay self-contained for GitHub visitors. The docs site is a supplement, not a replacement.

- [ ] **Step 2: Verify build still passes**

```bash
npm run docs:build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add link to GitHub Pages docs site in README

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 15: Enable GitHub Pages (manual)

This task requires a one-time manual action in the GitHub repository settings.

- [ ] **Step 1: Push the feature branch**

```bash
git push -u origin feature/github-pages
```

- [ ] **Step 2: Enable GitHub Pages in repository settings**

1. Go to `https://github.com/daften/fireflyiii-mcp/settings/pages`
2. Under **Source**, select **Deploy from a branch**
3. Under **Branch**, select `gh-pages` / `/ (root)`
4. Click **Save**

The `gh-pages` branch is created automatically by the workflow on the first push to `main` after the PR is merged.

- [ ] **Step 3: Merge the PR and verify deployment**

After merging to `main`:

1. Watch the **Deploy docs** workflow run at `https://github.com/daften/fireflyiii-mcp/actions`
2. When it completes, open `https://daften.github.io/fireflyiii-mcp/`
3. Verify: landing page loads, dark/light toggle works, sidebar navigation works, all links resolve

---

## Self-review notes

- **Spec coverage:** All spec sections covered — landing page, 4 guide pages + git-checkout (implied by landing table), 4 reference pages, 2 contributing pages, GitHub Actions workflow, README update
- **Git checkout page:** Added as `docs/guide/git-checkout.md` — implied by the landing page setup table but not listed in spec file structure; inclusion is correct
- **srcExclude:** `design/**` in config.ts excludes the existing `docs/design/` spec/plan folder from VitePress processing
- **base URL:** Set to `/fireflyiii-mcp/` — required for GitHub Pages project sites (not user/org root sites)
- **No placeholders:** All steps contain complete, runnable content
