# Roadmap Tasks 1–3: Split Transactions, Transaction Search, Recurring Transactions

**Date:** 2026-05-19  
**Status:** Approved

---

## Scope

Three additions to the Firefly III MCP server:

1. `create_split_transaction` — new tool in `src/tools/transactions.ts`
2. `search_transactions` — new tool in `src/tools/transactions.ts`
3. Recurring transactions — new file `src/tools/recurring.ts` with full CRUD, wired into `src/tools/index.ts`

---

## Task 1: `create_split_transaction`

### What it does

Creates a transaction group where a single receipt is split across multiple categories, budgets, or descriptions. Maps to the same POST `/transactions` endpoint as `create_transaction`, but sends multiple items in the `transactions` array.

### Fetch function: `createSplitTransaction`

Located in `src/tools/transactions.ts`.

**Parameters:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'withdrawal' \| 'deposit' \| 'transfer'` | Yes | Shared across all splits |
| `date` | `string` | Yes | YYYY-MM-DD, shared |
| `source_id` | `string` | No | Shared — required for withdrawals/transfers |
| `destination_id` | `string` | No | Shared — required for deposits/transfers |
| `currency_code` | `string` | No | Shared, defaults to account currency |
| `group_title` | `string` | No | Label for the transaction group |
| `splits` | `Split[]` | Yes | Min 2 items |

Each `Split`:

| Field | Type | Required |
|---|---|---|
| `amount` | `string` | Yes |
| `description` | `string` | Yes |
| `category_name` | `string` | No |
| `budget_id` | `string` | No |
| `tags` | `string[]` | No |
| `notes` | `string` | No |

**API body:**
```json
{
  "apply_rules": true,
  "fire_webhooks": true,
  "group_title": "Supermarket run",
  "transactions": [
    { "type": "withdrawal", "date": "2026-05-01", "source_id": "1", "amount": "30.00", "description": "Groceries", "category_name": "Food" },
    { "type": "withdrawal", "date": "2026-05-01", "source_id": "1", "amount": "12.50", "description": "Cleaning supplies", "category_name": "Household" }
  ]
}
```

**Return:** `unwrapSingle` — Firefly III returns the created transaction group as a single JSON:API object.

### Tool registration

- Tool name: `create_split_transaction`
- Annotations: `WRITE_ANNOTATIONS` (`{ openWorldHint: true }`)
- Input schema: Zod — top-level shared fields + `splits: z.array(...).min(2)`

---

## Task 2: `search_transactions`

### What it does

Keyword search across transactions via GET `/search/transactions`. Useful for finding transactions by description, amount, or other text content.

### Fetch function: `searchTransactions`

Located in `src/tools/transactions.ts`.

**Parameters:**

| Field | Type | Required | Default |
|---|---|---|---|
| `query` | `string` | Yes | — |
| `page` | `number` | No | `1` |
| `limit` | `number` | No | `50` (max 100) |

**API call:** `GET /search/transactions?query=<term>&page=<n>&limit=<n>`

**Return:** `unwrapList` — response is a standard JSON:API list envelope.

### Tool registration

- Tool name: `search_transactions`
- Annotations: `READ_ANNOTATIONS` (`{ readOnlyHint: true, openWorldHint: true, idempotentHint: true }`)
- Input schema: `query` required string, `page` and `limit` optional with defaults

---

## Task 3: Recurring Transactions

### New file: `src/tools/recurring.ts`

Five tools: `get_recurring` (list), `get_recurrence` (single by ID), `create_recurring`, `update_recurring`, `delete_recurring`.

### Firefly III API endpoints

| Operation | Endpoint |
|---|---|
| List | GET `/recurrences` |
| Single | GET `/recurrences/{id}` |
| Create | POST `/recurrences` |
| Update | PUT `/recurrences/{id}` |
| Delete | DELETE `/recurrences/{id}` |

Response shape: standard JSON:API envelope — `unwrapList` and `unwrapSingle` apply unchanged.

### Fetch functions

- `fetchRecurrences(client, { page, limit })` → `UnwrappedList`  
- `fetchRecurrence(client, id)` → `UnwrappedSingle`
- `createRecurrence(client, params)` → `UnwrappedSingle`
- `updateRecurrence(client, id, params)` → `UnwrappedSingle`
- `deleteRecurrence(client, id)` → `{ deleted: true, id }`

### Create / Update parameters

**Header fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'withdrawal' \| 'deposit' \| 'transfer'` | Yes (create) | Transaction type for all generated transactions |
| `title` | `string` | Yes (create) | Name of the recurring transaction |
| `description` | `string` | No | Description of the recurrence (not the transaction) |
| `notes` | `string` | No | Optional notes |
| `first_date` | `string` | Yes (create) | YYYY-MM-DD — date of first occurrence (must be in the future) |
| `repeat_until` | `string` | No | YYYY-MM-DD — stop after this date; pass `null` explicitly if using `nr_of_repetitions` |
| `nr_of_repetitions` | `number` | No | Stop after N occurrences; don't combine with `repeat_until` |
| `apply_rules` | `boolean` | No | Default `true` |
| `active` | `boolean` | No | Default `true` |

**Repetition fields** (sent as a single-item `repetitions` array):

| Field | Type | Required | Notes |
|---|---|---|---|
| `repeat_type` | `'daily' \| 'weekly' \| 'monthly' \| 'ndom' \| 'yearly'` | Yes (create) | Frequency |
| `repeat_moment` | `string` | Yes (create) | Empty string for `daily`; weekday 1–7 for `weekly` (1=Mon, 7=Sun); day of month 1–31 for `monthly`; `"week,day"` for `ndom` (e.g. `"2,3"` = 2nd Wednesday); full date `YYYY-MM-DD` for `yearly` (year ignored) |
| `skip` | `number` | No | Skip every N occurrences (0 = no skip, 1 = every other) |
| `weekend` | `number` | No | What to do when occurrence falls on a weekend: `1`=do nothing, `2`=skip (no transaction), `3`=previous Friday, `4`=next Monday |

**Transaction template fields** (sent as a single-item `transactions` array):

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | `string` | Yes (create) | Positive number string |
| `description` | `string` | Yes (create) | Description of the generated transaction |
| `source_id` | `string` | Yes (create) | Source account ID |
| `destination_id` | `string` | Yes (create) | Destination account ID |
| `category_id` | `string` | No | Category ID (recurring API only accepts ID, not name) |
| `budget_id` | `string` | No | |
| `currency_code` | `string` | No | |
| `tags` | `string[]` | No | |
| `notes` | `string` | No | |

**Example create body:**
```json
{
  "type": "withdrawal",
  "title": "Monthly rent",
  "first_date": "2026-06-01",
  "repeat_until": "2027-06-01",
  "apply_rules": true,
  "active": true,
  "repetitions": [{
    "type": "monthly",
    "moment": "1",
    "skip": 0,
    "weekend": 4
  }],
  "transactions": [{
    "amount": "950.00",
    "description": "Rent",
    "source_id": "1",
    "destination_id": "5",
    "category_id": "12"
  }]
}
```

### Tool annotations

- `get_recurring`, `get_recurrence`: `READ_ANNOTATIONS`
- `create_recurring`: `WRITE_ANNOTATIONS`
- `update_recurring`: `UPDATE_ANNOTATIONS`
- `delete_recurring`: `DELETE_ANNOTATIONS` — description includes "This action cannot be undone."

---

## File Changes Summary

| File | Change |
|---|---|
| `src/tools/transactions.ts` | Add `createSplitTransaction`, `searchTransactions` fetch functions + `create_split_transaction`, `search_transactions` tool registrations |
| `src/tools/recurring.ts` | New file — all five recurring tools |
| `src/tools/index.ts` | Import and call `registerRecurringTools` |
| `src/tests/transactions.test.ts` | Add tests for `createSplitTransaction` and `searchTransactions` |
| `src/tests/recurring.test.ts` | New file — tests for all five recurring fetch functions |
| `dist/` | Rebuild after source changes |

---

## Testing Strategy

Follows existing patterns:
- Mock `client.get` / `client.post` / `client.put` / `client.delete` with `vi.fn()`
- Fixtures use full JSON:API envelopes
- Assert both the call args (endpoint, body shape) and the return value shape
- For `createSplitTransaction`: assert that all shared fields are copied into each split object, and that the `transactions` array has the correct number of items
- For `searchTransactions`: assert query param is passed correctly
- For recurring: assert `repetitions` and `transactions` sub-arrays are constructed correctly
