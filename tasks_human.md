# Open-source readiness — Human tasks

Things only you can do (GitHub UI, npm UI, secret material). Ordered roughly
chronologically — items at the top can be done now, items at the bottom wait
until Claude finishes its tasks.

---

## Now (can be done in parallel with Claude's work)

- [ ] **Create an npm automation token.**
  - npmjs.com → avatar → Access Tokens → Generate New Token → **Granular Access Token** (recommended) or Classic → Automation.
  - Scope: `@daften/fireflyiii-mcp` package, read & write.
  - Copy the token immediately (shown only once).

- [ ] **Add `NPM_TOKEN` secret to the GitHub repo.**
  - Repo → Settings → Secrets and variables → Actions → New repository secret.
  - Name: `NPM_TOKEN`. Value: the automation token from above.

- [ ] **Set repo "About" metadata.**
  - Repo home page → ⚙ next to "About" (top-right of the right sidebar).
  - Description: e.g. *"MCP server that connects Claude to your Firefly III personal finance instance."*
  - Website: `https://www.npmjs.com/package/@daften/fireflyiii-mcp` (once published) or leave blank for now.
  - Topics: `mcp`, `model-context-protocol`, `firefly-iii`, `claude`, `personal-finance`, `typescript`, `nodejs`.
  - Tick "Releases" and "Packages" so they show on the sidebar.

- [ ] **Configure branch protection on `main`.**
  - Repo → Settings → Branches → Add branch ruleset (or classic "Add rule" if you prefer).
  - Target `main`.
  - Require pull request before merging (1 approval not strictly needed for a solo project — turn this off if you want to keep merging your own PRs without approval).
  - Require status checks to pass: select the `test` job (and `codeql` once Group 4 lands).
  - Require branches to be up to date before merging.
  - Restrict force pushes — **but allow force push from your own user** so the final history-collapse step works. Or disable temporarily for the collapse.

- [ ] **Workflow permissions sanity check.**
  - Repo → Settings → Actions → General → Workflow permissions.
  - Default ("Read repository contents and packages permissions") is fine — `publish.yml` requests `packages: write` and `contents: write` explicitly in each job, which overrides the default per-job.
  - Confirm "Allow GitHub Actions to create and approve pull requests" is **on** (needed for Dependabot to actually open PRs).

---

## After Claude finishes the tasks (before tagging v0.1.0)

- [ ] **Review the diff.** Look over what Claude changed. Pay attention to:
  - The Node version decision (Group 1, task 1).
  - The publish workflow changes (Group 2) — these only execute when tagged, so bugs here are silent until the first release.
  - The new OSS files (Group 4) — make sure the bug-report template asks the right questions.

- [ ] **Test the multi-arch Docker build locally** (optional but cheap insurance):
  ```bash
  docker buildx create --use --name fireflyiii-builder
  docker buildx build --platform linux/amd64,linux/arm64 -t fireflyiii-mcp:test .
  ```
  If it succeeds locally, the workflow will succeed.

- [ ] **Approve the history collapse** when Claude asks. This step rewrites public history — irreversible. Make sure you're OK losing the per-commit log.

---

## Publishing v0.1.0

- [ ] **Bump version + commit.** Claude can do this — just `npm version 0.1.0 --no-git-tag-version` then commit the `package.json` + lockfile change. (After Group 1's "read version from package.json" task lands, this is the *only* version touch needed.)

- [ ] **Tag and push.**
  ```bash
  git tag -a v0.1.0 -m "$(cat <<'EOF'
  ## [0.1.0] - 2026-05-23

  ### Added
  - 140 MCP tools across 14 groups (accounts, transactions, budgets, categories, bills, piggy banks, reports, rules, recurring, attachments, currencies, exports, object groups, transaction links).
  - Two transports: stdio (PAT auth) and HTTP (OAuth + PKCE with built-in proxy).
  - Tool filtering via --preset, --groups, --read-only.
  - npm package (@daften/fireflyiii-mcp) and Docker image (ghcr.io/daften/fireflyiii-mcp).
  EOF
  )"
  git push origin v0.1.0
  ```
  The publish workflow fires on tag push. Watch it in the Actions tab.

---

## After the first publish succeeds

- [ ] **Make the GHCR Docker image public.**
  - GitHub profile → Packages → `fireflyiii-mcp` → Package settings (right sidebar).
  - Change package visibility → Public → confirm.
  - Without this, `docker pull` from anonymous users fails with 403.

- [ ] **Confirm npm install works** from a clean directory:
  ```bash
  cd /tmp && npx -y @daften/fireflyiii-mcp --help 2>&1 | head
  ```

- [ ] **Confirm Docker pull works** from a clean machine (or just `docker system prune -a` first):
  ```bash
  docker pull ghcr.io/daften/fireflyiii-mcp:latest
  ```

- [ ] **Pin the npm package** to your GitHub profile via the GitHub UI (Profile → Customize your pins → add the repo). Increases discoverability.

- [ ] **(Optional) Submit to community lists** — modelcontextprotocol/servers list, awesome-mcp-servers, the Firefly III community add-ons section. Each one takes a PR with a one-line entry.
