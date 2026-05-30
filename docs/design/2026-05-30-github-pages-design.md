# GitHub Pages Site — Design Spec

**Date:** 2026-05-30  
**Project:** fireflyiii-mcp  
**Status:** Approved

---

## Overview

A VitePress-based GitHub Pages site for the `fireflyiii-mcp` project, consisting of a polished landing page and a full documentation section. Deployed automatically via GitHub Actions on every push to `main`.

---

## Tech Stack

- **Framework:** VitePress (latest stable)
- **Theme:** VitePress default theme — provides built-in dark/light mode toggle, sidebar navigation, full-text search, and mobile responsiveness out of the box
- **Hosting:** GitHub Pages, served from the `gh-pages` branch
- **Build:** GitHub Actions workflow (`.github/workflows/docs.yml`) — triggers on push to `main`, runs `vitepress build`, deploys output to `gh-pages`
- **URL:** `https://daften.github.io/fireflyiii-mcp/`

No custom Vue components needed for v1. All content is Markdown.

---

## Design Direction

- **Light mode default** with built-in dark mode toggle (VitePress default theme provides this with zero config)
- **Color accent:** VitePress default green (`#059669` family) — clean, readable, aligns with the docs-style aesthetic chosen
- **Typography:** VitePress default (Inter / system stack)

---

## Site Structure

```
docs/
├── index.md              # Landing page (VitePress home layout)
├── guide/
│   ├── index.md          # Overview & prerequisites
│   ├── stdio.md          # Setup: npm + stdio (simplest)
│   ├── http-oauth.md     # Setup: npm + HTTP/OAuth
│   └── docker.md         # Setup: Docker + HTTP (self-hosted)
├── reference/
│   ├── tools.md          # All 140 tools across 14 groups
│   ├── filtering.md      # Tool filtering: presets, groups, read-only
│   ├── autocomplete.md   # Experimental autocomplete prompts
│   └── env-vars.md       # Environment variable reference
└── contributing/
    ├── index.md          # Development setup
    └── new-tool.md       # Guide: adding a new tool
```

VitePress config lives at `docs/.vitepress/config.ts`.

---

## Landing Page (`index.md`)

Uses VitePress `layout: home` with the standard `hero` + `features` frontmatter blocks, plus custom Markdown sections below.

### Hero block

```yaml
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
```

### Features strip (4 tiles)

| Icon | Title | Subtitle |
|------|-------|----------|
| 🛠 | 140 tools | 14 groups |
| 🔌 | stdio & HTTP | PAT + OAuth 2.0 |
| 🎛 | Tool filtering | Presets & groups |
| 🐳 | Docker ready | Self-hosted |

### "What you can ask" section

Five example queries covering distinct Firefly III features:

1. *"How much did I spend on groceries last month?"*
2. *"Find any duplicate transactions in the last 30 days."*
3. *"Set up a piggy bank for my vacation fund with a €2000 target, linked to my savings account."*
4. *"Which bills are coming up this week and am I on track?"*
5. *"What were my biggest expense categories this year?"*

### Quickstart section

Shows the simplest setup (npm + stdio) as a code block with the `npx` one-liner config snippet. Three links below it:

- stdio guide →
- HTTP/OAuth guide →
- 🐳 Docker (ghcr.io) →

### All setup options section

2×2 grid of cards linking to the four setup guides:
- npm + stdio — Simplest · same machine
- npm + HTTP/OAuth — Remote access · OAuth flow
- 🐳 Docker + HTTP — Self-hosted · ghcr.io
- Git checkout — Contributing · dev mode

---

## Docs Navigation (sidebar)

```
Getting Started
  ├── Overview
  ├── stdio setup (npm)
  ├── HTTP/OAuth setup (npm)
  └── Docker setup

Reference
  ├── Available tools
  ├── Tool filtering
  ├── Autocomplete prompts
  └── Environment variables

Contributing
  ├── Development setup
  └── Adding a new tool
```

---

## GitHub Actions Workflow

File: `.github/workflows/docs.yml`

- **Trigger:** push to `main`
- **Steps:** checkout → Node 20 setup → `npm ci` (root) → `vitepress build docs` → deploy to `gh-pages` branch via `peaceiris/actions-gh-pages@v4`
- **Permissions:** `contents: write` (for gh-pages push)

The workflow runs independently of the existing `ci.yml` (which runs tests). Both can run in parallel on push to `main`.

---

## Content Sourcing

- Landing page: new content, written from scratch
- Guide pages: adapted and reformatted from `README.md` sections (Options 1–4)
- Reference/tools page: adapted from the "Available Tools" section of `README.md`
- Reference/filtering page: adapted from "Filtering Tools" section of `README.md`
- Autocomplete page: adapted from the "Experimental Autocomplete Prompts" section
- Env vars page: adapted from the "Environment Variables" section of `AGENTS.md`
- Contributing pages: adapted from `CONTRIBUTING.md` and the "Adding a New Tool" section of `AGENTS.md`

The `README.md` retains a condensed version with a prominent link to the full docs site. It does not become a stub — it stays useful on its own for GitHub visitors.

---

## Language & Tone

- Use "MCP-compatible AI assistant" (not "Claude") wherever possible — the server works with any MCP client
- Avoid jargon without explanation: "PAT" is acceptable (common in developer tooling); "PKCE" should not appear in user-facing text
- Direct link to `ghcr.io/daften/fireflyiii-mcp` in the Docker guide and the hero buttons

---

## Out of Scope (v1)

- Custom Vue components or JavaScript beyond VitePress defaults
- Blog or changelog page (CHANGELOG.md remains the source of truth)
- i18n / translations
- Versioned docs
- Analytics
