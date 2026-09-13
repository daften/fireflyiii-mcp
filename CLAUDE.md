# Claude Code Instructions

Welcome! This repository uses a universal agent instruction standard. 

Please read the **[AGENTS.md](AGENTS.md)** file at the root of this project. It is the universal, cross-tool single source of truth for all coding assistants, detailing:
- **Project Overview** & **Tech Stack**
- **Build & Test Commands**
- **Coding Conventions** (ESM, strict TypeScript, tool registration patterns)
- **Git Commit standards**
- **Branching Model** (`develop` integrates, `main` stays releasable) & **Releasing a New Version** — `[Unreleased]` accumulates on `develop`; the dated changelog section and version bump go on a `release/X.Y.Z` branch that reaches `main` as one PR, and the tag is cut on the resulting merge commit

## Claude-Specific Preferences
- **System Instructions**: Adhere strictly to the project rules and structures documented in [AGENTS.md](AGENTS.md).
- **Environment Variables**: Configure `.env` as explained in [AGENTS.md](AGENTS.md) when running local integrations.
