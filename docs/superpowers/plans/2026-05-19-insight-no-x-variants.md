# Insight "No X" Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 read-only MCP tools that return transactions with nothing attached to a given field (bill, budget, category, or tag), backed by a single exported helper `fetchInsightNoX`.

**Architecture:** One exported helper function `fetchInsightNoX(client, endpoint, start, end)` is added to `src/tools/reports.ts`; all 8 tools call it with their specific endpoint path. Tests import `fetchInsightNoX` directly and verify each endpoint URL. No new files needed.

**Tech Stack:** TypeScript ESM, `@modelcontextprotocol/sdk`, Zod, Vitest.

---

### Task 1: Write failing tests for `fetchInsightNoX`

**Files:**
- Modify: `src/tests/reports.test.ts`

- [ ] **Step 1: Add `fetchInsightNoX` to the import in `src/tests/reports.test.ts`**

Open `src/tests/reports.test.ts`. The current import line reads:

```typescript
import {
  fetchTags,
  fetchTagTransactions,
  fetchSummary,
  fetchInsightExpenses,
  fetchInsightIncome,
  createTag,
  updateTag,
  deleteTag,
} from '../tools/reports.js';
```

Change it to:

```typescript
import {
  fetchTags,
  fetchTagTransactions,
  fetchSummary,
  fetchInsightExpenses,
  fetchInsightIncome,
  fetchInsightNoX,
  createTag,
  updateTag,
  deleteTag,
} from '../tools/reports.js';
```

- [ ] **Step 2: Append the `fetchInsightNoX` test suite to the end of `src/tests/reports.test.ts`**

Add these lines after the last `describe` block (after the `deleteTag` describe block):

```typescript
describe('fetchInsightNoX', () => {
  const endpoints = [
    '/insight/expense/no-bill',
    '/insight/expense/no-budget',
    '/insight/expense/no-category',
    '/insight/expense/no-tag',
    '/insight/income/no-category',
    '/insight/income/no-tag',
    '/insight/transfer/no-category',
    '/insight/transfer/no-tag',
  ];

  for (const endpoint of endpoints) {
    it(`calls ${endpoint} with start and end`, async () => {
      mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
      await fetchInsightNoX(mockClient, endpoint, '2026-01-01', '2026-01-31');
      expect(mockClient.get).toHaveBeenCalledWith(endpoint, {
        start: '2026-01-01',
        end: '2026-01-31',
      });
    });
  }

  it('returns the raw result from the API', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    const result = await fetchInsightNoX(mockClient, '/insight/expense/no-bill', '2026-01-01', '2026-01-31');
    expect(result).toEqual(insightFixture);
  });
});
```

- [ ] **Step 3: Run the tests — expect failure**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(fetchInsightNoX|FAIL|✓|×)"
```

Expected output includes lines like:
```
× fetchInsightNoX > calls /insight/expense/no-bill with start and end
```
(Failure because `fetchInsightNoX` is not yet exported from `reports.ts`.)

---

### Task 2: Implement `fetchInsightNoX` and pass the tests

**Files:**
- Modify: `src/tools/reports.ts`

- [ ] **Step 1: Add `fetchInsightNoX` export to `src/tools/reports.ts`**

Open `src/tools/reports.ts`. After the `fetchInsightIncome` function (currently ends around line 53) and before the `createTag` function, insert:

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

- [ ] **Step 2: Run the tests — expect them to pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(fetchInsightNoX|FAIL|PASS)"
```

Expected: all 9 `fetchInsightNoX` tests pass (8 endpoint tests + 1 return value test). No other tests should regress.

- [ ] **Step 3: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts
git commit -m "$(cat <<'EOF'
feat: add fetchInsightNoX helper with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Register the 8 insight no-X tools

**Files:**
- Modify: `src/tools/reports.ts`

- [ ] **Step 1: Add all 8 tool registrations to `registerReportTools`**

Open `src/tools/reports.ts`. Find the end of `registerReportTools` — the closing `}` after the `delete_tag` tool registration (currently around line 250). Insert the following 8 `server.registerTool` calls **before** that closing `}`:

```typescript
  server.registerTool(
    'get_insight_expenses_no_bill',
    {
      title: 'Get Expense Insights — No Bill',
      description: 'Get expense totals for transactions that have no bill attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-bill', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_budget',
    {
      title: 'Get Expense Insights — No Budget',
      description: 'Get expense totals for transactions that have no budget attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-budget', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_category',
    {
      title: 'Get Expense Insights — No Category',
      description: 'Get expense totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_tag',
    {
      title: 'Get Expense Insights — No Tag',
      description: 'Get expense totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_income_no_category',
    {
      title: 'Get Income Insights — No Category',
      description: 'Get income totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/income/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_income_no_tag',
    {
      title: 'Get Income Insights — No Tag',
      description: 'Get income totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/income/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_transfer_no_category',
    {
      title: 'Get Transfer Insights — No Category',
      description: 'Get transfer totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/transfer/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_transfer_no_tag',
    {
      title: 'Get Transfer Insights — No Tag',
      description: 'Get transfer totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/transfer/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass. Total count increases by 9 (the `fetchInsightNoX` tests from Task 1).

- [ ] **Step 3: Compile TypeScript to confirm no type errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/reports.ts
git commit -m "$(cat <<'EOF'
feat: register 8 insight no-X tools (expense, income, transfer)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update CLAUDE.md roadmap and commit dist

**Files:**
- Modify: `CLAUDE.md`
- Modify: `dist/` (build output — committed to git per project convention)

- [ ] **Step 1: Mark the roadmap item complete in `CLAUDE.md`**

Open `CLAUDE.md`. Find the line:

```markdown
- [ ] **Insight "no X" variants** — add to `src/tools/reports.ts`: tools that return expenses/income for transactions with *nothing* attached to a given field;
```

Change `- [ ]` to `- [x]`.

- [ ] **Step 2: Build dist**

```bash
npm run build 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 3: Commit source and dist together**

```bash
git add CLAUDE.md dist/
git commit -m "$(cat <<'EOF'
docs: mark insight no-X variants complete; rebuild dist

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
