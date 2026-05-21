# Design: Low-Priority Features + Full API Coverage

**Date:** 2026-05-21  
**Scope:** All remaining low-priority roadmap items plus every additional API endpoint identified during discovery.

---

## Overview

This spec covers ~50 new tools across two categories:

1. **Roadmap items** — the 7 remaining low-priority features from CLAUDE.md
2. **API gap closure** — additional endpoints discovered by diffing the Firefly III OpenAPI spec against the current implementation

The result will be near-complete API coverage, excluding only the explicitly excluded categories (webhooks, preferences, configuration, cron, user/user-group management, data destroy/purge).

---

## File & Group Structure

### New files (new tool groups)

| File | Group | Tools |
|---|---|---|
| `src/tools/currencies.ts` | `currencies` | `get_currencies`, `get_currency`, `create_currency`, `update_currency`, `delete_currency` |
| `src/tools/exports.ts` | `exports` | `export_transactions`, `export_accounts`, `export_bills`, `export_budgets`, `export_categories`, `export_tags`, `export_recurring`, `export_rules`, `export_piggy_banks` |
| `src/tools/object-groups.ts` | `object-groups` | `get_object_groups`, `get_object_group`, `create_object_group`, `update_object_group`, `delete_object_group`, `get_object_group_bills`, `get_object_group_piggy_banks` |
| `src/tools/transaction-links.ts` | `transaction-links` | `get_link_types`, `get_transaction_links`, `get_transaction_link`, `create_transaction_link`, `update_transaction_link`, `delete_transaction_link` |

### Additions to existing files

| File | Group | New tools |
|---|---|---|
| `src/tools/reports.ts` | `reports` | `get_about`, `get_net_worth_summary`, `get_account_overview_chart`, `get_balance_chart`, `get_budget_chart`, `get_category_chart`, `get_exchange_rate`, + 14 insight variants (see below) |
| `src/tools/accounts.ts` | `accounts` | `get_account_transactions`, `search_accounts` |
| `src/tools/budgets.ts` | `budgets` | `get_available_budgets`, `get_available_budget`, `get_budget_transactions`, `get_transactions_without_budget` |
| `src/tools/bills.ts` | `bills` | `get_bill_transactions` |
| `src/tools/piggy-banks.ts` | `piggy-banks` | `get_piggy_bank_events`, `create_piggy_bank_event`, `delete_piggy_bank_event` |
| `src/tools/rules.ts` | `rules` | `trigger_rule`, `test_rule`, `test_rule_group`, `get_rule_group_rules` |
| `src/tools/recurring.ts` | `recurring` | `trigger_recurrence`, `get_recurrence_transactions` |
| `src/tools/attachments.ts` | `attachments` | `download_attachment` |
| `src/tools/transactions.ts` | `transactions` | `bulk_update_transactions` |

### Preset / group wiring

`TOOL_GROUPS` in `src/tools/index.ts` gains four entries: `currencies`, `exports`, `object-groups`, `transaction-links`. Since `full` is defined as `[...TOOL_GROUPS]`, it picks them up automatically. All other presets (`minimal`, `default`, `budgeting`, `insights`, `automation`) stay unchanged — the new groups are niche admin/utility features.

`args.ts` validates group names against `TOOL_GROUPS` — no other changes needed there.

---

## Tool Details

### Currencies (`src/tools/currencies.ts`)

Endpoint base: `/currencies/{code}` (code-keyed, not ID-keyed).

- `get_currencies` — `GET /currencies` — paginated list
- `get_currency` — `GET /currencies/{code}` — single by code
- `create_currency` — `POST /currencies` — params: `name`, `code`, `symbol`, `decimal_places?`, `enabled?`, `default?`
- `update_currency` — `PUT /currencies/{code}` — params: `name?`, `code?`, `symbol?`, `decimal_places?`, `enabled?`, `default?`
- `enable_currency` — `POST /currencies/{code}/enable` — param: `code`. Enables the currency.
- `disable_currency` — `POST /currencies/{code}/disable` — param: `code`. Disables the currency.
- `set_primary_currency` — `POST /currencies/{code}/primary` — param: `code`. Sets as default currency.
- `delete_currency` — `DELETE /currencies/{code}`

All responses go through `unwrapSingle` / `unwrapList` (JSON:API envelope).

### Exports (`src/tools/exports.ts`)

Endpoint pattern: `GET /data/export/{entity}?type=csv`

Tools: `export_transactions`, `export_accounts`, `export_bills`, `export_budgets`, `export_categories`, `export_tags`, `export_recurring`, `export_rules`, `export_piggy_banks`.

`export_transactions` accepts optional `start`/`end` date filters. Others take no params beyond the implicit `type=csv`.

Response handling: call `client.get()` with `responseType: 'text'` — the endpoint returns raw CSV. Return the CSV body directly as `text` content so Claude can read/analyze it inline.

**Note:** `FireflyClient.get()` returns parsed JSON. A `getText()` method must be added to `src/client.ts` to return raw response body as a string.

### Object Groups (`src/tools/object-groups.ts`)

- `get_object_groups` — `GET /object-groups` — paginated list
- `get_object_group` — `GET /object-groups/{id}` — single
- `create_object_group` — `POST /object-groups` — params: `title`, `order?`
- `update_object_group` — `PUT /object-groups/{id}` — params: `title?`, `order?`
- `delete_object_group` — `DELETE /object-groups/{id}` — destructive
- `get_object_group_bills` — `GET /object-groups/{id}/bills` — list bills in group
- `get_object_group_piggy_banks` — `GET /object-groups/{id}/piggy-banks` — list piggy banks in group

All list/single responses through `unwrapList` / `unwrapSingle`.

### Transaction Links (`src/tools/transaction-links.ts`)

Link types are system-defined (e.g. "related", "refund", "paid"). Transaction links connect two transaction journals.

- `get_link_types` — `GET /link-types` — paginated list (read-only)
- `get_transaction_links` — `GET /transaction-journals/{id}/links` — links for a journal entry; param: `journal_id`
- `get_transaction_link` — `GET /transaction-links/{id}` — single link
- `create_transaction_link` — `POST /transaction-links` — params: `link_type_id`, `in_id` (journal ID), `out_id` (journal ID), `notes?`
- `update_transaction_link` — `PUT /transaction-links/{id}` — params: `link_type_id?`, `in_id?`, `out_id?`, `notes?`
- `delete_transaction_link` — `DELETE /transaction-links/{id}` — destructive

### Reports additions (`src/tools/reports.ts`)

**`get_about`** — `GET /about` — no params. Returns server version, OS, PHP version, etc. Read-only.

**`get_net_worth_summary`** — `GET /summary/net-worth?start=&end=` — accepts `start`, `end`, optional `currency_code`. Returns flat array (not JSON:API). Pass through directly.

**Chart tools** — `GET /chart/account/overview`, `/chart/balance/balance`, `/chart/budget/overview`, `/chart/category/overview`. All accept `start` and `end` date params. Return flat arrays — pass through directly.

**`get_exchange_rate`** — `GET /exchange-rates/by-currencies/{from}/{to}?date=` — params: `from`, `to` (currency codes), optional `date` (YYYY-MM-DD). Returns exchange rate data.

**14 new insight variants:**

All accept `start`, `end`. Some accept an optional filter array to narrow results.

| Tool name | Endpoint | Optional filter param |
|---|---|---|
| `get_insight_expenses_by_bill` | `/insight/expense/bill` | `bills[]` — array of bill IDs |
| `get_insight_expenses_by_budget` | `/insight/expense/budget` | `budgets[]` — array of budget IDs |
| `get_insight_expenses_by_tag` | `/insight/expense/tag` | `tags[]` — array of tag IDs |
| `get_insight_expenses_by_asset` | `/insight/expense/asset` | `assets[]` — array of account IDs |
| `get_insight_expenses_by_expense_account` | `/insight/expense/expense` | `accounts[]` — array of account IDs |
| `get_insight_expenses_total` | `/insight/expense/total` | none |
| `get_insight_income_by_revenue` | `/insight/income/revenue` | `revenue[]` — array of account IDs |
| `get_insight_income_by_tag` | `/insight/income/tag` | `tags[]` — array of tag IDs |
| `get_insight_income_by_asset` | `/insight/income/asset` | `assets[]` — array of account IDs |
| `get_insight_income_total` | `/insight/income/total` | none |
| `get_insight_transfers_by_category` | `/insight/transfer/category` | `categories[]` — array of category IDs |
| `get_insight_transfers_by_tag` | `/insight/transfer/tag` | `tags[]` — array of tag IDs |
| `get_insight_transfers_by_asset` | `/insight/transfer/asset` | `assets[]` — array of account IDs |
| `get_insight_transfers_total` | `/insight/transfer/total` | none |

Filter arrays are passed as repeated query params (`bills[]=1&bills[]=2`). The `FireflyClient.get()` method will need to support array query params — verify this and add support if missing.

### Accounts additions (`src/tools/accounts.ts`)

- `get_account_transactions` — `GET /accounts/{id}/transactions` — params: `id`, optional `start`, `end`, `type` (enum), `page`, `limit`. Goes through `unwrapList`.
- `search_accounts` — `GET /search/accounts?query=` — params: `query`, optional `field` (name/iban/number/all — default `all`), `page`, `limit`. Goes through `unwrapList`.

### Budgets additions (`src/tools/budgets.ts`)

- `get_available_budgets` — `GET /available-budgets` — paginated list. `unwrapList`.
- `get_available_budget` — `GET /available-budgets/{id}` — single. `unwrapSingle`.
- `get_budget_transactions` — `GET /budgets/{id}/transactions` — params: `id`, optional `start`, `end`, `page`, `limit`. `unwrapList`.
- `get_transactions_without_budget` — `GET /budgets/transactions-without-budget` — params: optional `start`, `end`, `page`, `limit`. `unwrapList`.

### Bills additions (`src/tools/bills.ts`)

- `get_bill_transactions` — `GET /bills/{id}/transactions` — params: `id`, optional `start`, `end`, `page`, `limit`. `unwrapList`.

### Piggy bank additions (`src/tools/piggy-banks.ts`)

- `get_piggy_bank_events` — `GET /piggy-banks/{id}/events` — params: `id`, optional `page`, `limit`. `unwrapList`.
- `create_piggy_bank_event` — `POST /piggy-banks/{id}/events` — params: `id`, `amount` (string), `date` (YYYY-MM-DD). Positive amount = deposit, negative = withdrawal. `unwrapSingle`.
- `delete_piggy_bank_event` — `DELETE /piggy-banks/{id}/events/{eventId}` — params: `id`, `event_id`. Destructive.

### Rules additions (`src/tools/rules.ts`)

- `get_rule_group_rules` — `GET /rule-groups/{id}/rules` — params: `id`, `page`, `limit`. `unwrapList`.
- `test_rule` — `GET /rules/{id}/test` — params: `id`, optional `start`, `end`, `page`, `limit`. Returns matching transactions (flat array). Read-only.
- `test_rule_group` — `GET /rule-groups/{id}/test` — same params. Returns matching transactions. Read-only.
- `trigger_rule` — `POST /rules/{id}/trigger` — params: `id`, optional `start`, `end`. Runs the rule against existing transactions. Write (`openWorldHint: true`). Returns confirmation.
### Recurring additions (`src/tools/recurring.ts`)

- `get_recurrence_transactions` — `GET /recurrences/{id}/transactions` — params: `id`, optional `page`, `limit`. `unwrapList`.
- `trigger_recurrence` — `POST /recurrences/{id}/trigger` — params: `id`, optional `date`. Returns confirmation.

### Attachments additions (`src/tools/attachments.ts`)

- `download_attachment` — `GET /attachments/{id}/download` — param: `id`. Returns raw content as text. Uses same `getText()` helper as exports.

### Transactions additions (`src/tools/transactions.ts`)

- `bulk_update_transactions` — `POST /data/bulk/transactions` — params: `query` (search string, same syntax as `search_transactions`), plus one or more update fields: `category_name?`, `budget_id?`, `tags?` (array, replaces all), `notes?`. Returns `{ updated: number }` count. Annotated as `{ openWorldHint: true }`.

---

## Client Changes

Two additions to `src/client.ts`:

1. **`getText(path, params?)`** — like `get()` but returns the raw response body as a string instead of parsing JSON. Used by export tools and `download_attachment`.

2. **Array query param support** — `QueryParams` in `src/types.ts` is currently `Record<string, string | number | undefined>`. Extend it to `Record<string, string | number | string[] | undefined>`. Update the URL-builder in `FireflyClient.get()` to serialize arrays as repeated params (`key[]=v1&key[]=v2`).

---

## Testing Strategy

- **New files** get their own test file in `src/tests/` (currencies, exports, object-groups, transaction-links).
- **Additions to existing files** get new test cases appended to the existing test file for that domain.
- **Export / download tools** test that `client.getText()` is called with the right path and that the raw string is returned as content.
- **Insight filter arrays** test that array params are serialized correctly in the URL.
- **Action tools** (`trigger_rule`, `trigger_recurrence`, `bulk_update_transactions`) test that the correct HTTP method and body are used and that the confirmation response is returned.
- All fixtures use realistic JSON:API envelopes for wrapped responses; flat arrays for insight/chart/search endpoints.

---

## Build & Commit Plan

Work in file-by-file steps, committing source + dist after each:

1. Client changes (`getText`, array query params)
2. `src/tools/reports.ts` additions
3. `src/tools/accounts.ts` additions
4. `src/tools/budgets.ts` additions
5. `src/tools/bills.ts` addition
6. `src/tools/piggy-banks.ts` additions
7. `src/tools/rules.ts` additions
8. `src/tools/recurring.ts` additions
9. `src/tools/attachments.ts` addition
10. `src/tools/transactions.ts` addition
11. New file: `src/tools/currencies.ts`
12. New file: `src/tools/exports.ts`
13. New file: `src/tools/object-groups.ts`
14. New file: `src/tools/transaction-links.ts`
15. Wire all new groups into `src/tools/index.ts`
16. Tests for all new/changed files
17. Update README + CLAUDE.md roadmap
