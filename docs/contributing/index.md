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
