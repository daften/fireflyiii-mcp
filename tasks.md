# Open-source readiness — Claude tasks

Tasks are grouped so each group can be dispatched to an independent subagent
without file-overlap conflicts. Within a group, complete items in order. Mark
items `[x]` when done. After every group, run `npm test` and `npx tsc --noEmit`
to verify nothing broke, then commit.

**Status (2026-05-23):** Groups 1–6 ✅ done. Only the final history-collapse
step remains (gated on user approval).

---

## Group 1 — Bug fixes & repo hygiene ✅

Touches: `README.md`, `package.json`, `src/server.ts`, `.env.example`, `.gitignore`, `docs/`.

- [x] **Reconcile Node version mismatch.** → Chose Node 20 (no Node-22-only APIs found). `engines.node: ">=20"`, `node:20-alpine`, README "Node.js 20+".
- [x] **Read version from `package.json` instead of hardcoding it in `src/server.ts:8`.** → Runtime `readFileSync` approach used (TS `rootDir: "src"` blocked the JSON import attribute path). CLAUDE.md + CONTRIBUTING.md updated to drop the dual-bump step.
- [x] **`npm audit fix`** → `qs` 6.15.1 → 6.15.2, advisory cleared. `npm audit --omit=dev` reports 0 vulnerabilities.
- [x] **Add `MCP_BASE_URL` to `.env.example`.**
- [x] **Remove `docs/superpowers/` from the repo** (21 files removed from index, added to `.gitignore`, files preserved on disk).

---

## Group 2 — Publish workflow improvements ✅

Touches: `.github/workflows/publish.yml` only.

- [x] **Add npm provenance** (`--provenance` + `id-token: write` permission).
- [x] **Auto-create GitHub Release from the tag annotation** via `softprops/action-gh-release@v2` in a new `release` job that runs after both publish jobs succeed.
- [x] **Multi-arch Docker build** (`linux/amd64,linux/arm64` via `setup-qemu-action` + `setup-buildx-action`).
- [x] **Use `docker/metadata-action` for tag derivation** → produces `:0.1.0`, `:0.1`, `:0`, `:latest` from `v0.1.0`.

---

## Group 3 — CI workflow improvements ✅

Touches: `.github/workflows/ci.yml` only.

- [x] **Add Node version matrix** `[20, 22, 24]` with `fail-fast: false`.
- [x] **Run `npm audit --audit-level=moderate --omit=dev` in CI.**

---

## Group 4 — OSS conventions (new files) ✅

Touches: only new files under repo root and `.github/`.

- [x] **`CODE_OF_CONDUCT.md`** — Contributor Covenant v2.1, contact `dieterblomme@gmail.com`.
- [x] **`.github/ISSUE_TEMPLATE/bug_report.yml`**, **`feature_request.yml`**, **`config.yml`**.
- [x] **`.github/PULL_REQUEST_TEMPLATE.md`**.
- [x] **`.github/dependabot.yml`** (npm + github-actions, weekly, grouped).
- [x] **`.github/workflows/codeql.yml`** (javascript-typescript, push/PR/weekly).

---

## Group 5 — README polish ✅

Touches: `README.md` only.

- [x] **Badge row** (npm version, npm downloads, CI status, MIT license).
- [x] **"What you can ask Claude" example block** with 5 sample prompts.
- [x] **Collapsed all 14 tool tables under `<details>` blocks** (verified `grep -c '<details>'` = 14).

---

## Group 6 — Lint/format ✅

Touches: `biome.json` (new), `src/**/*.ts` (formatting), `package.json` (scripts), `.github/workflows/ci.yml` (lint step).

- [x] **Biome 2.4.15** installed (pinned exact, no caret). Config: 2-space, single quotes, semicolons, 120-char line width, all trailing commas, organizeImports enabled.
- [x] **Auto-formatting applied** across all 43 `src/**/*.ts` files (single commit so blame stays clean).
- [x] **Lint fixes** applied: `useLiteralKeys` (process.env, headers), `noGlobalIsNan`, `useIterableCallbackReturn` (block-body forEach), `noImplicitAnyLet` (typed `let parsed: ParsedArgs`).
- [x] **Rules disabled** in `biome.json` with rationale: `style/noNonNullAssertion` (idiomatic in strict TS), `suspicious/noExplicitAny` (needed for JSON:API generics + Vitest mocks).
- [x] **`npm run lint` / `npm run format`** scripts wired.
- [x] **`npx biome ci src/`** step added to CI (runs across the Node 20/22/24 matrix).

---

## Final — single-commit history collapse

Run ONLY after all other groups are merged to `main` and the working tree is clean.

- [ ] **Confirm with the user before starting.** This is destructive and rewrites public history.
- [ ] Check out a fresh branch from `main`: `git checkout --orphan release-v0.1.0`.
- [ ] `git add -A && git commit -m "<comprehensive squash message>"` — message should summarise what the codebase does, list the 14 tool groups, mention the two transports, link to docs.
- [ ] Force-push to `main`: `git branch -M release-v0.1.0 main && git push -f origin main`.
- [ ] Verify GitHub Actions still pass on the new commit before tagging v0.1.0.
- [ ] Hand back to the user — they handle the actual `git tag v0.1.0` + push (per `tasks_human.md`).
