# Write Tools + HTTP Transport — Design Spec

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** Phase 2 — write tools (full CRUD) and HTTP transport alongside existing stdio

---

## Overview

Two independent additions to the Firefly III MCP server:

1. **Write tools** — create, update, and delete operations for every resource that already has read tools (transactions, accounts, budgets, budget limits, categories, bills, piggy banks, tags).
2. **HTTP transport** — opt-in via `--transport http` CLI flag; stdio remains the default and is unchanged.

Both additions follow the existing code patterns exactly. No structural reorganisation.

---

## 1. Client Extension (`src/client.ts`)

### New methods

`FireflyClient` gains three new public methods alongside `get()`:

```typescript
post<T = unknown>(path: string, body: unknown): Promise<T>
put<T = unknown>(path: string, body: unknown): Promise<T>
delete(path: string): Promise<void>   // 204 No Content — no return value
```

All three share the same timeout (30 s), abort controller, and Bearer auth logic already in `get()`. A private `request()` helper consolidates the fetch boilerplate; the four public methods call through it with their respective HTTP method.

`delete()` returns `void` — Firefly III responds with 204 No Content on success.  
`post()` and `put()` both return `200 OK` with the saved resource (Firefly uses 200, not 201, for creates).

### Updated `formatError`

The existing handler is extended with two cases:

| Code | New behaviour |
|------|--------------|
| `400` | `'Bad request — check your input parameters.'` |
| `422` | Parse the response body JSON and surface field-level errors: `'Validation failed: transactions.0.amount — required'`. Falls back to the generic message if parsing fails. |

The `FireflyError` class already stores the raw body string, so no constructor change is needed — only `formatError` changes.

Firefly III 422 body shape:
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "transactions.0.amount": ["The amount field is required."]
  }
}
```

---

## 2. Write Tools

### Pattern

Write operations are added directly to the existing tool files — co-located with the reads for each resource. Each file gains fetch functions and `registerXxxTools` calls for create, update, and delete.

**Fetch function signature (create):**
```typescript
export async function createTransaction(
  client: FireflyClient,
  params: { type: string; date: string; amount: string; ... }
): Promise<UnwrappedSingle>
```

**Fetch function signature (delete):**
```typescript
export async function deleteTransaction(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }>
```
Deletes have no API body to unwrap, so the fetch function returns a plain confirmation object.

### Annotations

| Operation | Annotations |
|-----------|-------------|
| `create_*` | `{ openWorldHint: true }` |
| `update_*` | `{ openWorldHint: true, idempotentHint: true }` |
| `delete_*` | `{ destructiveHint: true, openWorldHint: true }` |

### Delete tool descriptions

Every delete tool description includes an explicit warning:

> "Permanently deletes [resource]. **This action cannot be undone.**"

This surfaces the risk to the LLM before the tool is called.

### Resources and tools

| File | New tools added |
|------|----------------|
| `transactions.ts` | `create_transaction`, `update_transaction`, `delete_transaction` |
| `accounts.ts` | `create_account`, `update_account`, `delete_account` |
| `budgets.ts` | `create_budget`, `update_budget`, `delete_budget`, `create_budget_limit`, `update_budget_limit`, `delete_budget_limit` |
| `categories.ts` | `create_category`, `update_category`, `delete_category` |
| `bills.ts` | `create_bill`, `update_bill`, `delete_bill` |
| `piggy-banks.ts` | `create_piggy_bank`, `update_piggy_bank`, `delete_piggy_bank` |
| `reports.ts` | `create_tag`, `update_tag`, `delete_tag` |

### Transaction payload mapping

Firefly III wraps transaction data in a `transactions[]` array at the API level. The fetch function handles this translation so the MCP tool schema stays flat:

**Tool inputs (flat):**
```
type, date, amount, description, source_id, destination_id,
category_name?, budget_id?, currency_code?, notes?, tags?
```

**Mapped to API body:**
```json
{
  "apply_rules": true,
  "fire_webhooks": true,
  "transactions": [{ "type": "...", "date": "...", ... }]
}
```

For `update_transaction`, all fields except `id` are optional — callers only need to pass what they want to change. Firefly's PUT endpoint accepts partial data (fields omitted from the request retain their existing values).

### API response codes (confirmed from spec)

| Code | Meaning | Handled by |
|------|---------|-----------|
| 200 | Created / updated resource in body | `unwrapSingle` |
| 204 | Deleted, no body | `delete()` returns void |
| 400 | Bad request | `formatError` (new case) |
| 401 | Unauthenticated | `formatError` (existing) |
| 404 | Not found | `formatError` (existing) |
| 422 | Validation error, field details in body | `formatError` (improved) |
| 500 | Server error | `formatError` (existing) |

---

## 3. HTTP Transport

### New file: `src/http.ts`

Exports a single function:

```typescript
export async function startHttpServer(
  server: McpServer,
  host: string,
  port: number,
  portWasExplicit: boolean
): Promise<void>
```

**Port resolution:**
1. Probe the requested port using `net.createServer` (bind + immediate close).
2. If free → bind and start.
3. If taken **and `portWasExplicit` is false** → increment port by 1 and retry, up to 10 attempts.
4. If taken **and `portWasExplicit` is true** → exit with a clear error message.
5. On successful bind, print to stdout:
   ```
   Firefly III MCP server listening on http://127.0.0.1:3001
   (port 3000 was in use — moved up automatically)
   ```
   (The second line is omitted when the originally requested port was used.)

**HTTP server:** Uses Node's built-in `http.createServer` — no Express or external HTTP framework. The MCP SDK's `StreamableHTTPServerTransport` handles the MCP-over-HTTP protocol. All incoming requests are routed to the transport.

**No authentication:** HTTP transport ships with no auth layer. A future iteration will add OAuth via Firefly III (which will also replace the PAT token for Firefly API auth in HTTP mode).

### CLI parsing in `src/index.ts`

A minimal `parseArgs()` function reads `process.argv`. No external dependency.

**Recognised flags:**

| Flag | Default | Notes |
|------|---------|-------|
| `--transport stdio\|http` | `stdio` | Selects transport |
| `--host <host>` | `127.0.0.1` | HTTP only |
| `--port <number>` | `3000` | HTTP only; tracked for explicit vs default |

**Startup flow:**
```
parseArgs()
  → transport === 'stdio': connect StdioServerTransport (existing behaviour, unchanged)
  → transport === 'http':  call startHttpServer(server, host, port, portWasExplicit)
```

Stdio path is completely unchanged — existing Claude Desktop / MCP config continues to work with no changes.

---

## 4. Testing

### Write tool tests

Each new fetch function gets a unit test in the existing `src/tests/{category}.test.ts` file:

- **Create:** mock `client.post`, pass a minimal JSON:API single-response fixture, assert `unwrapSingle` output shape and that `client.post` was called with the correct path and mapped body.
- **Update:** same as create with `client.put`.
- **Delete:** mock `client.delete`, assert it was called with the correct path, assert the `{ deleted: true, id }` return value.
- **422 error path:** mock `client.post` to throw a `FireflyError(422, ...)` with a realistic validation body, assert the formatted error string includes the field name and message.

### Client tests

`src/tests/client.test.ts` gets tests for `post()`, `put()`, and `delete()` covering success paths and the timeout/abort behaviour already tested for `get()`.

### HTTP transport

No unit test for `startHttpServer` — the port-probing logic is integration-level behaviour. Document in README that HTTP transport can be tested with `npm run dev -- --transport http`.

---

## 5. File Changes Summary

| File | Change |
|------|--------|
| `src/client.ts` | Add `post()`, `put()`, `delete()` via private `request()`; update `formatError` |
| `src/index.ts` | Add `parseArgs()`; branch on transport |
| `src/http.ts` | New file — `startHttpServer()` |
| `src/tools/transactions.ts` | Add create/update/delete fetch + register functions |
| `src/tools/accounts.ts` | Add create/update/delete fetch + register functions |
| `src/tools/budgets.ts` | Add create/update/delete for budgets and budget limits |
| `src/tools/categories.ts` | Add create/update/delete fetch + register functions |
| `src/tools/bills.ts` | Add create/update/delete fetch + register functions |
| `src/tools/piggy-banks.ts` | Add create/update/delete fetch + register functions |
| `src/tools/reports.ts` | Add create/update/delete for tags |
| `src/tests/client.test.ts` | Tests for new client methods |
| `src/tests/transactions.test.ts` | Tests for write fetch functions |
| `src/tests/accounts.test.ts` | Tests for write fetch functions |
| `src/tests/budgets.test.ts` | Tests for write fetch functions |
| `src/tests/categories.test.ts` | Tests for write fetch functions |
| `src/tests/bills.test.ts` | Tests for write fetch functions |
| `src/tests/piggy-banks.test.ts` | Tests for write fetch functions |
| `src/tests/reports.test.ts` | Tests for write fetch functions (tags) |
| `CLAUDE.md` | Update Phase 2 section to reflect what shipped |

No new dependencies required. `dist/` rebuilt and committed alongside source.

---

## Out of Scope (Future)

- HTTP authentication (OAuth via Firefly III — replaces PAT in HTTP mode)
- HTTP transport tests
- Multi-split transaction support (Phase 2 create/update handles single-split only)
- Bulk operations
