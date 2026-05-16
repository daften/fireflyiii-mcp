# Design: JSON:API Response Stripping

**Date:** 2026-05-17  
**Status:** Approved

## Problem

All Firefly III list and single-item endpoints return JSON:API envelopes. Tools currently pass the raw response straight to `JSON.stringify`, so Claude receives:

- Per-item `type`, `links` fields (redundant noise)
- A top-level `links` object with pagination URLs (not useful to Claude)
- A `meta.pagination` object nested two levels deep
- 40+ `attributes` fields per account item, many null

This wastes context tokens and makes responses harder for Claude to parse.

## Goal

Strip the JSON:API envelope in fetch functions so tool handlers return clean, flat data. Claude sees compact objects with pagination context instead of raw API envelopes.

## Approach

**Option A (chosen):** Centralise stripping logic in `src/transform.ts`. Each fetch function calls the appropriate transform before returning. Tool handlers are unchanged.

## New File: `src/transform.ts`

Three exported functions:

### `unwrapList(response)`

Input — JSON:API list envelope (confirmed against live API):
```json
{
  "data": [
    {
      "id": "240",
      "type": "accounts",
      "attributes": { "name": "Checking", "current_balance": "1234.56", ... },
      "links": { "self": "...", "0": { "rel": "self", "uri": "..." } }
    }
  ],
  "meta": {
    "pagination": { "total": 2580, "count": 1, "per_page": 50, "current_page": 1, "total_pages": 52 }
  }
}
```

Output:
```json
{
  "data": [{ "id": "240", "name": "Checking", "current_balance": "1234.56", ... }],
  "pagination": { "page": 1, "totalPages": 52, "total": 2580 }
}
```

- Flattens `{ id, ...attributes }` — strips `type` and `links` per item
- Reduces `meta.pagination` to `{ page, totalPages, total }` — gives Claude enough to know whether to paginate
- `pagination` is `undefined` when the response has no `meta.pagination`

### `unwrapSingle(response)`

Input — JSON:API single-item envelope:
```json
{
  "data": {
    "id": "240",
    "type": "accounts",
    "attributes": { "name": "Checking", ... },
    "links": { "self": "..." }
  }
}
```

Output:
```json
{ "id": "240", "name": "Checking", ... }
```

### `cleanSummary(response)`

The `/summary/basic` endpoint returns an array (not JSON:API), but each item's `value` object contains UI-only fields useless to Claude: `local_icon`, `sub_title`, `currency_symbol`, `currency_decimal_places`.

Input item:
```json
{
  "key": "balance-in-EUR",
  "value": {
    "key": "balance-in-EUR",
    "title": "Balance (€)",
    "monetary_value": "8818.16",
    "currency_id": "1",
    "currency_code": "EUR",
    "currency_symbol": "€",
    "currency_decimal_places": 2,
    "value_parsed": "€8,818.16",
    "local_icon": "balance-scale",
    "sub_title": "-€20,448.98 + €29,267.14"
  }
}
```

Output item:
```json
{
  "key": "balance-in-EUR",
  "value": {
    "key": "balance-in-EUR",
    "title": "Balance (€)",
    "monetary_value": "8818.16",
    "currency_id": "1",
    "currency_code": "EUR",
    "value_parsed": "€8,818.16"
  }
}
```

## Fetch Function Changes

| Transform | Fetch functions |
|---|---|
| `unwrapList` | `fetchAccounts`, `fetchTransactions`, `fetchBudgets`, `fetchBudgetLimits`, `fetchCategories`, `fetchCategoryTransactions`, `fetchBills`, `fetchPiggyBanks`, `fetchTags`, `fetchTagTransactions` |
| `unwrapSingle` | `fetchAccount`, `fetchTransaction` |
| `cleanSummary` | `fetchSummary` |
| Pass-through (already flat) | `fetchInsightExpenses`, `fetchInsightIncome` |

Each change is a one-liner wrapping the `client.get()` result. Return types change from `Promise<unknown>` to the appropriate typed output.

## TypeScript Types (in `transform.ts`)

```typescript
interface JsonApiItem {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  links?: unknown;
}

interface JsonApiListResponse {
  data: JsonApiItem[];
  meta?: {
    pagination?: {
      current_page: number;
      total_pages: number;
      total: number;
    };
  };
}

interface JsonApiSingleResponse {
  data: JsonApiItem;
}

interface RawSummaryItem {
  key: string;
  value: Record<string, unknown>;
}

export interface CleanSummaryItem {
  key: string;
  value: {
    key: string;
    title: string;
    monetary_value: string;
    currency_id: string;
    currency_code: string;
    value_parsed: string;
  };
}

export interface UnwrappedList {
  data: Array<{ id: string } & Record<string, unknown>>;
  pagination?: { page: number; totalPages: number; total: number };
}

export type UnwrappedSingle = { id: string } & Record<string, unknown>;
```

## Testing

### New: `src/tests/transform.test.ts`

Unit tests for all three functions using realistic fixture data matching the live API shapes:

- `unwrapList`: flattens items, extracts pagination, handles missing pagination
- `unwrapSingle`: merges id + attributes, strips type and links
- `cleanSummary`: keeps the six useful fields, drops the four UI fields

### Updated: existing fetch function tests

Current mocks use minimal shapes (`{ data: [] }`). Update to use realistic JSON:API envelopes and add return-value assertions alongside the existing call-arg assertions.

## Out of Scope

- Stripping `null` fields from `attributes` — accounts have 40+ fields, many null. Worth doing but a separate concern.
- Insight endpoints (`fetchInsightExpenses`, `fetchInsightIncome`) — already return flat arrays with no envelope. No changes needed.
