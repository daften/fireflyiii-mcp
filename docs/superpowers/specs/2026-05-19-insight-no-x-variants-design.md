# Design: Insight "No X" Variants

**Date:** 2026-05-19  
**Status:** Approved

## Summary

Add 8 new read-only tools to `src/tools/reports.ts` that return expenses, income, or transfers for transactions with nothing attached to a given field (bill, budget, category, tag). Useful for finding uncategorized, untagged, or unbudgeted transactions.

## Endpoints (verified against Firefly III OpenAPI 6.5.5)

| Tool name | API endpoint |
|---|---|
| `get_insight_expenses_no_bill` | `GET /insight/expense/no-bill` |
| `get_insight_expenses_no_budget` | `GET /insight/expense/no-budget` |
| `get_insight_expenses_no_category` | `GET /insight/expense/no-category` |
| `get_insight_expenses_no_tag` | `GET /insight/expense/no-tag` |
| `get_insight_income_no_category` | `GET /insight/income/no-category` |
| `get_insight_income_no_tag` | `GET /insight/income/no-tag` |
| `get_insight_transfer_no_category` | `GET /insight/transfer/no-category` |
| `get_insight_transfer_no_tag` | `GET /insight/transfer/no-tag` |

Transfer variants (`no-category`, `no-tag`) are included beyond the original roadmap scope; they exist in the spec and are structurally identical.

## Fetch Layer

One exported helper in `src/tools/reports.ts`:

```typescript
export async function fetchInsightNoX(
  client: FireflyClient,
  endpoint: string,
  start: string,
  end: string
): Promise<unknown> {
  return client.get(endpoint, { start, end });
}
```

All 8 endpoints accept `start` and `end` (both required, YYYY-MM-DD) and return `InsightTotal` — a flat array with no JSON:API envelope:

```json
[{ "difference": "-102.97", "difference_float": -102.97, "currency_id": "1", "currency_code": "EUR" }]
```

No transform needed; matches the pattern of the existing `fetchInsightExpenses` and `fetchInsightIncome`.

## Tool Registration

All 8 tools are registered inside `registerReportTools(server, client)` in `src/tools/reports.ts`. No new file needed.

Each tool:
- `inputSchema`: `{ start: z.string().describe('Start date (YYYY-MM-DD)'), end: z.string().describe('End date (YYYY-MM-DD)') }`
- `annotations`: `READ_ANNOTATIONS` (`readOnlyHint`, `openWorldHint`, `idempotentHint`)
- Handler: calls `fetchInsightNoX(client, '<endpoint>', start, end)`, wraps result as `text` content

## Testing

Add to `src/tests/reports.test.ts`. Import `fetchInsightNoX` directly (it is exported). Write one test per endpoint verifying the correct URL is called with `{ start, end }`. Reuse the existing `insightFixture`.

## CLAUDE.md Roadmap

The 6 endpoints listed in the roadmap are covered. Update the roadmap checkbox to mark this task complete after implementation.
