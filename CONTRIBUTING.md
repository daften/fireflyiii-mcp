# Contributing

## Development loop

```bash
npm install          # Install dependencies
npm test             # Run unit tests
npm run test:watch   # Watch mode
npm run build        # Compile TypeScript → dist/
```

TypeScript errors: `npx tsc --noEmit`.

## dist/ rule

`dist/` is committed to git so the server works via `node dist/index.js` without a build step. **Always run `npm run build` and include `dist/` in the same commit as source changes.**

## Adding a new tool

1. Pick the right tool file under `src/tools/` (or create one for a new category).
2. Implement a `fetchXxx(client, params)` function that calls `client.get()` and pipes through a transform from `src/transform.ts`.
3. Add a `registerXxxTools(server, client)` call inside the register function in that file.
4. If creating a new tool file, add the group to `TOOL_GROUPS` in `src/tools/index.ts` and wire it in `registerAllTools`. Consider which presets it belongs in.
5. Write a test in `src/tests/{category}.test.ts` — mock `client.get` with a realistic JSON:API envelope fixture.
6. Update the tool table in `README.md`.
7. Run `npm run build` and commit source + `dist/` together.

Always verify field names, required/optional status, and enums against the Firefly III OpenAPI spec before implementing:

```bash
curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0" | grep -A 100 "YourSchema:"
```

## Running integration tests

Integration tests hit a live Firefly III instance. Copy `.env.example` to `.env.test`, fill in `FIREFLY_URL` and `FIREFLY_TOKEN`, then:

```bash
npm run test:integration
```

These are skipped in CI; run them manually before submitting changes to API-calling code.

## Releasing a new version

1. Bump `version` in `package.json` and `src/server.ts` to the new semver.
2. Run `npm run build` and commit the version bump together with `dist/`.
3. Create an annotated git tag whose message is a [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) entry covering every change since the previous tag:

```
git tag -a v0.2.0 -m "$(cat <<'EOF'
## [0.2.0] - 2026-05-22

### Added
- Thing that was added

### Changed
- Thing that changed

### Fixed
- Bug that was fixed

### Removed
- Thing that was removed
EOF
)"
git push origin v0.2.0
```

Sections to include: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**. Omit empty sections.

---

## Commit conventions

```
feat:     New tool or feature
fix:      Bug fix
refactor: Code cleanup without behavior change
test:     Add or update tests
chore:    Dependencies, config, scaffolding
docs:     Documentation only
```

Include a short subject line (≤72 chars). No period at the end.
