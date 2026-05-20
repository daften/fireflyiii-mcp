# Rules & Rule Groups + File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automation rule/rule-group CRUD + trigger/test operations and file attachment CRUD + binary upload, each in a new tool file following the existing domain-per-file pattern.

**Architecture:** Two new tool files (`src/tools/rules.ts`, `src/tools/attachments.ts`) each exporting pure fetch functions and a `registerXxxTools()` function. Minor extensions to `src/types.ts` (array values in QueryParams) and `src/client.ts` (array URL params, `post()` query params, `postBinary()`). Wired into `src/tools/index.ts`. Tested via `src/tests/rules.test.ts` and `src/tests/attachments.test.ts`.

**Tech Stack:** TypeScript ESM, Zod v3, Vitest, `@modelcontextprotocol/sdk`, `FireflyClient` from `src/client.ts`, transforms from `src/transform.ts`.

---

### File map

| Action | Path | Purpose |
|---|---|---|
| Modify | `src/types.ts` | Extend QueryParams to support `number[]` |
| Modify | `src/client.ts` | Array URL params; `post()` with optional query params; `postBinary()` |
| Modify | `src/tests/client.test.ts` | Three new tests for the client changes |
| Create | `src/tools/rules.ts` | All rule/rule-group functions + `registerRuleTools()` |
| Create | `src/tests/rules.test.ts` | Unit tests for all rules fetch/write/action functions |
| Create | `src/tools/attachments.ts` | All attachment functions + `registerAttachmentTools()` |
| Create | `src/tests/attachments.test.ts` | Unit tests for all attachment functions including upload |
| Modify | `src/tools/index.ts` | Import and call both new `registerXxx` functions |

---

### Task 1: Extend types.ts and client.ts

**Files:**
- Modify: `src/types.ts`
- Modify: `src/client.ts`
- Modify: `src/tests/client.test.ts`

- [ ] **Step 1: Write failing tests — add to `src/tests/client.test.ts`**

Add inside the existing `describe('FireflyClient', () => {` block (before the closing `}`):

```typescript
  it('appends repeated query params for number[] values in get()', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/rule-groups/1/test', { 'accounts[]': [1, 2, 3] });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('accounts%5B%5D=1');
    expect(calledUrl).toContain('accounts%5B%5D=2');
    expect(calledUrl).toContain('accounts%5B%5D=3');
  });

  it('post() appends query params to URL when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.post('/rule-groups/1/trigger', undefined, { start: '2026-01-01', end: '2026-12-31' });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('start=2026-01-01');
    expect(calledUrl).toContain('end=2026-12-31');
  });
```

Add inside the existing `describe('FireflyClient write methods', () => {` block:

```typescript
  it('postBinary() sends POST with octet-stream Content-Type and returns undefined on 204', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const data = new Uint8Array([1, 2, 3]);
    const result = await client.postBinary('/attachments/1/upload', data);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/attachments/1/upload',
      expect.objectContaining({
        method: 'POST',
        body: data,
        headers: expect.objectContaining({ 'Content-Type': 'application/octet-stream' }),
      })
    );
    expect(result).toBeUndefined();
  });

  it('postBinary() throws FireflyError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.postBinary('/attachments/999/upload', new Uint8Array([]))).rejects.toThrow(FireflyError);
  });
```

- [ ] **Step 2: Run tests — confirm 5 new failures**

```bash
npm test -- src/tests/client.test.ts
```

Expected: existing tests pass; 5 new tests fail with `TypeError` or `property does not exist`.

- [ ] **Step 3: Update `src/types.ts`**

Replace the entire file content:

```typescript
export type QueryParams = Record<string, string | number | number[] | undefined>;
```

- [ ] **Step 4: Update `src/client.ts`**

Replace the entire file with the following. Key changes: add private `buildUrl()`, update `get()` and `post()` to use it, add `postBinary()`.

```typescript
import type { QueryParams } from './types.js';

export class FireflyError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`Firefly III API error ${status} at ${url}: ${body}`);
    this.name = 'FireflyError';
  }
}

export function formatError(err: unknown): string {
  if (err instanceof FireflyError) {
    if (err.status === 400) return 'Bad request — check your input parameters.';
    if (err.status === 401) return 'Authentication failed. Check your FIREFLY_TOKEN.';
    if (err.status === 404) return 'Resource not found.';
    if (err.status === 422) {
      try {
        const parsed = JSON.parse(err.body) as { errors?: Record<string, string[]> };
        if (parsed.errors && Object.keys(parsed.errors).length > 0) {
          const details = Object.entries(parsed.errors)
            .map(([field, msgs]) => `${field} — ${msgs.join(', ')}`)
            .join('; ');
          return `Validation failed: ${details}`;
        }
      } catch {
        // fall through
      }
      return 'Invalid request parameters.';
    }
    if (err.status >= 500) return 'Firefly III server error. Try again later.';
    return `API error ${err.status}.`;
  }
  if (err instanceof Error) return err.message;
  return 'An unknown error occurred.';
}

export class FireflyClient {
  private readonly baseUrl: string;
  private readonly timeoutMs = 30_000;

  constructor(baseUrl: string, private readonly tokenResolver: string | (() => string)) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getToken(): string {
    return typeof this.tokenResolver === 'function' ? this.tokenResolver() : this.tokenResolver;
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new FireflyError(response.status, url, responseBody);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as T;
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>('GET', this.buildUrl(path, params));
  }

  async post<T = unknown>(path: string, body: unknown, params?: QueryParams): Promise<T> {
    return this.request<T>('POST', this.buildUrl(path, params), body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}/api/v1${path}`, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', `${this.baseUrl}/api/v1${path}`);
  }

  async postBinary(path: string, body: Uint8Array): Promise<void> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          'Content-Type': 'application/octet-stream',
        },
        body,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new FireflyError(response.status, url, responseBody);
    }
  }
}
```

- [ ] **Step 5: Run tests — confirm all pass**

```bash
npm test -- src/tests/client.test.ts
```

Expected: all tests pass including the 5 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/client.ts src/tests/client.test.ts
git commit -m "feat: extend QueryParams for arrays, post() query params, postBinary()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Rule group and rule CRUD functions + tests

**Files:**
- Create: `src/tests/rules.test.ts`
- Create: `src/tools/rules.ts` (fetch and CRUD functions only — no `registerRuleTools` yet)

- [ ] **Step 1: Create `src/tests/rules.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchRuleGroups, fetchRuleGroup, createRuleGroup, updateRuleGroup, deleteRuleGroup,
  fetchRules, fetchRule, createRule, updateRule, deleteRule,
} from '../tools/rules.js';

const mockClient = {
  get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), postBinary: vi.fn(),
} as unknown as FireflyClient;

const ruleGroupListFixture = {
  data: [
    {
      id: '1',
      type: 'rule_groups',
      attributes: { title: 'Default group', active: true, description: null },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const ruleGroupSingleFixture = {
  data: {
    id: '1',
    type: 'rule_groups',
    attributes: { title: 'Default group', active: true, description: null },
    links: {},
  },
};

describe('fetchRuleGroups', () => {
  it('calls /rule-groups with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupListFixture);
    await fetchRuleGroups(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupListFixture);
    const result = await fetchRuleGroups(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRuleGroup', () => {
  it('calls /rule-groups/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await fetchRuleGroup(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    const result = await fetchRuleGroup(mockClient, '1');
    expect(result).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
  });
});

describe('createRuleGroup', () => {
  it('posts to /rule-groups', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await createRuleGroup(mockClient, { title: 'New group', active: true });
    expect(mockClient.post).toHaveBeenCalledWith('/rule-groups', { title: 'New group', active: true });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    const result = await createRuleGroup(mockClient, { title: 'Default group' });
    expect(result).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
  });
});

describe('updateRuleGroup', () => {
  it('puts to /rule-groups/:id with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await updateRuleGroup(mockClient, '1', { title: 'Renamed group' });
    expect(mockClient.put).toHaveBeenCalledWith('/rule-groups/1', { title: 'Renamed group' });
  });
});

describe('deleteRuleGroup', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRuleGroup(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/rule-groups/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

const ruleListFixture = {
  data: [
    {
      id: '10',
      type: 'rules',
      attributes: {
        title: 'Tag groceries',
        active: true,
        trigger: 'store-journal',
        strict: true,
        stop_processing: false,
      },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const ruleSingleFixture = {
  data: {
    id: '10',
    type: 'rules',
    attributes: {
      title: 'Tag groceries',
      active: true,
      trigger: 'store-journal',
      strict: true,
      stop_processing: false,
    },
    links: {},
  },
};

describe('fetchRules', () => {
  it('calls /rules with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleListFixture);
    await fetchRules(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/rules', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleListFixture);
    const result = await fetchRules(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toMatchObject({ title: 'Tag groceries', id: '10' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRule', () => {
  it('calls /rules/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await fetchRule(mockClient, '10');
    expect(mockClient.get).toHaveBeenCalledWith('/rules/10');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    const result = await fetchRule(mockClient, '10');
    expect(result).toMatchObject({ title: 'Tag groceries', id: '10' });
  });
});

describe('createRule', () => {
  it('posts to /rules with required fields including triggers and actions', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await createRule(mockClient, {
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/rules', expect.objectContaining({
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    const result = await createRule(mockClient, {
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    });
    expect(result).toMatchObject({ title: 'Tag groceries', id: '10' });
  });
});

describe('updateRule', () => {
  it('puts to /rules/:id with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await updateRule(mockClient, '10', { title: 'Updated groceries rule', active: false });
    expect(mockClient.put).toHaveBeenCalledWith('/rules/10', { title: 'Updated groceries rule', active: false });
  });

  it('includes triggers and actions arrays when provided', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await updateRule(mockClient, '10', {
      triggers: [{ type: 'amount_more', value: '100' }],
      actions: [{ type: 'add_tag', value: 'large-purchase' }],
    });
    expect(mockClient.put).toHaveBeenCalledWith('/rules/10', {
      triggers: [{ type: 'amount_more', value: '100' }],
      actions: [{ type: 'add_tag', value: 'large-purchase' }],
    });
  });
});

describe('deleteRule', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRule(mockClient, '10');
    expect(mockClient.delete).toHaveBeenCalledWith('/rules/10');
    expect(result).toEqual({ deleted: true, id: '10' });
  });
});
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
npm test -- src/tests/rules.test.ts
```

Expected: module `../tools/rules.js` not found; all tests fail.

- [ ] **Step 3: Create `src/tools/rules.ts`** (fetch + CRUD functions, no register function yet)

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

// ---- Rule group fetch + CRUD ----

export async function fetchRuleGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/rule-groups', query);
  return unwrapList(response);
}

export async function fetchRuleGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/rule-groups/${id}`);
  return unwrapSingle(response);
}

export async function createRuleGroup(
  client: FireflyClient,
  params: { title: string; description?: string; active?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/rule-groups', params);
  return unwrapSingle(response);
}

export async function updateRuleGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; description?: string; active?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rule-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRuleGroup(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/rule-groups/${id}`);
  return { deleted: true, id };
}

// ---- Rule fetch + CRUD ----

type RuleTriggerInput = {
  type: string;
  value: string;
  prohibited?: boolean;
  active?: boolean;
  stop_processing?: boolean;
  order?: number;
};

type RuleActionInput = {
  type: string;
  value: string | null;
  active?: boolean;
  stop_processing?: boolean;
  order?: number;
};

export async function fetchRules(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/rules', query);
  return unwrapList(response);
}

export async function fetchRule(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/rules/${id}`);
  return unwrapSingle(response);
}

export async function createRule(
  client: FireflyClient,
  params: {
    title: string;
    rule_group_id: string;
    trigger: string;
    triggers: RuleTriggerInput[];
    actions: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/rules', params);
  return unwrapSingle(response);
}

export async function updateRule(
  client: FireflyClient,
  id: string,
  params: {
    title?: string;
    rule_group_id?: string;
    trigger?: string;
    triggers?: RuleTriggerInput[];
    actions?: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rules/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRule(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/rules/${id}`);
  return { deleted: true, id };
}

// registerRuleTools added in Task 4
export function registerRuleTools(_server: McpServer, _client: FireflyClient): void { void z; }
```

> Note: The stub `registerRuleTools` keeps the module valid while the real implementation comes in Task 4. The `void z` silences the unused-import warning.

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test -- src/tests/rules.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/rules.ts src/tests/rules.test.ts
git commit -m "feat: add rule group and rule CRUD functions with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Rule trigger and test functions

**Files:**
- Modify: `src/tests/rules.test.ts` (append new describe blocks)
- Modify: `src/tools/rules.ts` (append four new functions)

- [ ] **Step 1: Append trigger/test tests to `src/tests/rules.test.ts`**

Add these imports at the top of the file (replace the existing import line):

```typescript
import {
  fetchRuleGroups, fetchRuleGroup, createRuleGroup, updateRuleGroup, deleteRuleGroup,
  fetchRules, fetchRule, createRule, updateRule, deleteRule,
  triggerRuleGroup, triggerRule, testRuleGroup, testRule,
} from '../tools/rules.js';
```

Then append these describe blocks at the end of the file:

```typescript
const transactionListFixture = {
  data: [
    {
      id: '99',
      type: 'transactions',
      attributes: { description: 'Supermarket', amount: '45.00', type: 'withdrawal' },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('triggerRuleGroup', () => {
  it('posts to /rule-groups/:id/trigger with date filters', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    const result = await triggerRuleGroup(mockClient, '1', { start: '2026-01-01', end: '2026-12-31' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/rule-groups/1/trigger',
      undefined,
      { start: '2026-01-01', end: '2026-12-31' }
    );
    expect(result).toEqual({ triggered: true, id: '1' });
  });

  it('passes undefined params when no filters provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    await triggerRuleGroup(mockClient, '2', {});
    expect(mockClient.post).toHaveBeenCalledWith('/rule-groups/2/trigger', undefined, undefined);
  });

  it('passes accounts array when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    await triggerRuleGroup(mockClient, '3', { accounts: [1, 2] });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/rule-groups/3/trigger',
      undefined,
      { 'accounts[]': [1, 2] }
    );
  });
});

describe('triggerRule', () => {
  it('posts to /rules/:id/trigger with date filters', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    const result = await triggerRule(mockClient, '10', { start: '2026-01-01', end: '2026-06-30' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/rules/10/trigger',
      undefined,
      { start: '2026-01-01', end: '2026-06-30' }
    );
    expect(result).toEqual({ triggered: true, id: '10' });
  });

  it('passes undefined params when no filters provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    await triggerRule(mockClient, '10', {});
    expect(mockClient.post).toHaveBeenCalledWith('/rules/10/trigger', undefined, undefined);
  });
});

describe('testRuleGroup', () => {
  it('gets /rule-groups/:id/test with date filters and returns transaction list', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(transactionListFixture);
    const result = await testRuleGroup(mockClient, '1', { start: '2026-01-01', end: '2026-12-31' });
    expect(mockClient.get).toHaveBeenCalledWith(
      '/rule-groups/1/test',
      { start: '2026-01-01', end: '2026-12-31' }
    );
    expect(result.data[0]).toMatchObject({ description: 'Supermarket', id: '99' });
  });

  it('passes accounts array with correct key', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(transactionListFixture);
    await testRuleGroup(mockClient, '1', { accounts: [5, 6] });
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups/1/test', { 'accounts[]': [5, 6] });
  });

  it('passes search_limit and triggered_limit', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(transactionListFixture);
    await testRuleGroup(mockClient, '1', { search_limit: 200, triggered_limit: 10 });
    expect(mockClient.get).toHaveBeenCalledWith(
      '/rule-groups/1/test',
      { search_limit: 200, triggered_limit: 10 }
    );
  });
});

describe('testRule', () => {
  it('gets /rules/:id/test and returns transaction list', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(transactionListFixture);
    const result = await testRule(mockClient, '10', { start: '2026-01-01', end: '2026-12-31' });
    expect(mockClient.get).toHaveBeenCalledWith(
      '/rules/10/test',
      { start: '2026-01-01', end: '2026-12-31' }
    );
    expect(result.data[0]).toMatchObject({ id: '99' });
  });

  it('returns empty list when no transactions match', async () => {
    const empty = { data: [], meta: { pagination: { current_page: 1, total_pages: 0, total: 0 } } };
    mockClient.get = vi.fn().mockResolvedValueOnce(empty);
    const result = await testRule(mockClient, '10', {});
    expect(mockClient.get).toHaveBeenCalledWith('/rules/10/test', {});
    expect(result.data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm 10 new failures**

```bash
npm test -- src/tests/rules.test.ts
```

Expected: existing tests pass; new describe blocks fail with `triggerRuleGroup is not a function` (or similar).

- [ ] **Step 3: Append four functions to `src/tools/rules.ts`**

Add these functions after `deleteRule` and before the `registerRuleTools` stub:

```typescript
// ---- Trigger and test operations ----

export async function triggerRuleGroup(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[] }
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  await client.post<void>(`/rule-groups/${id}/trigger`, undefined, Object.keys(query).length ? query : undefined);
  return { triggered: true, id };
}

export async function triggerRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[] }
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  await client.post<void>(`/rules/${id}/trigger`, undefined, Object.keys(query).length ? query : undefined);
  return { triggered: true, id };
}

export async function testRuleGroup(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[]; search_limit?: number; triggered_limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  if (params.search_limit !== undefined) query['search_limit'] = params.search_limit;
  if (params.triggered_limit !== undefined) query['triggered_limit'] = params.triggered_limit;
  const response = await client.get<JsonApiListResponse>(`/rule-groups/${id}/test`, query);
  return unwrapList(response);
}

export async function testRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[] }
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  const response = await client.get<JsonApiListResponse>(`/rules/${id}/test`, query);
  return unwrapList(response);
}
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test -- src/tests/rules.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/rules.ts src/tests/rules.test.ts
git commit -m "feat: add rule trigger and test functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: registerRuleTools() and wire index.ts

**Files:**
- Modify: `src/tools/rules.ts` (replace stub with real implementation)
- Modify: `src/tools/index.ts`

There are no unit tests for tool registration (it is integration-level). Verify via `npm run build`.

- [ ] **Step 1: Replace the `registerRuleTools` stub in `src/tools/rules.ts`**

Replace the two lines at the bottom of the file:

```typescript
// registerRuleTools added in Task 4
export function registerRuleTools(_server: McpServer, _client: FireflyClient): void { void z; }
```

With the full implementation:

```typescript
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

const triggerSchema = z.object({
  type: z.enum([
    'from_account_starts', 'from_account_ends', 'from_account_is', 'from_account_contains',
    'to_account_starts', 'to_account_ends', 'to_account_is', 'to_account_contains',
    'amount_less', 'amount_exactly', 'amount_more',
    'description_starts', 'description_ends', 'description_contains', 'description_is',
    'transaction_type', 'category_is', 'budget_is', 'tag_is', 'currency_is',
    'has_attachments', 'has_no_category', 'has_any_category', 'has_no_budget',
    'has_any_budget', 'has_no_tag', 'has_any_tag',
    'notes_contains', 'notes_starts', 'notes_end', 'notes_are', 'no_notes', 'any_notes',
    'source_account_is', 'destination_account_is', 'source_account_starts',
  ]).describe('Trigger type keyword'),
  value: z.string().describe('Value the trigger matches against (required by most trigger types)'),
  prohibited: z.boolean().optional().describe('Negate the trigger — "description contains" becomes "description does NOT contain"'),
  active: z.boolean().optional().default(true).describe('Whether this trigger is active'),
  stop_processing: z.boolean().optional().default(false).describe('Skip remaining triggers if this one matches'),
  order: z.number().int().optional().describe('Execution order among triggers'),
});

const actionSchema = z.object({
  type: z.enum([
    'user_action', 'set_category', 'clear_category', 'set_budget', 'clear_budget',
    'add_tag', 'remove_tag', 'remove_all_tags',
    'set_description', 'append_description', 'prepend_description',
    'set_source_account', 'set_destination_account',
    'set_notes', 'append_notes', 'prepend_notes', 'clear_notes',
    'link_to_bill', 'convert_withdrawal', 'convert_deposit', 'convert_transfer',
    'delete_transaction',
  ]).describe('Action type keyword'),
  value: z.string().nullable().describe('Value for the action (use empty string or null for clear/boolean action types)'),
  active: z.boolean().optional().default(true).describe('Whether this action is active'),
  stop_processing: z.boolean().optional().default(false).describe('Skip remaining actions after this one fires'),
  order: z.number().int().optional().describe('Execution order among actions'),
});

export function registerRuleTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_rule_groups', {
    title: 'Get Rule Groups',
    description: 'Get all rule groups from Firefly III. Rule groups organise related rules.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchRuleGroups(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_rule_group', {
    title: 'Get Rule Group',
    description: 'Get a single rule group by ID. Use get_rule_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Rule group ID'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchRuleGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_rule_group', {
    title: 'Create Rule Group',
    description: 'Create a new rule group in Firefly III.',
    inputSchema: {
      title: z.string().describe('Rule group name'),
      description: z.string().optional().describe('Description'),
      active: z.boolean().optional().default(true).describe('Whether the group is active'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createRuleGroup(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_rule_group', {
    title: 'Update Rule Group',
    description: 'Update an existing rule group. Only fields provided will be changed. Use get_rule_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
      title: z.string().optional().describe('Rule group name'),
      description: z.string().optional().describe('Description'),
      active: z.boolean().optional().describe('Whether the group is active'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateRuleGroup(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_rule_group', {
    title: 'Delete Rule Group',
    description: 'Permanently delete a rule group and all its rules from Firefly III. **This action cannot be undone.** Use get_rule_groups to confirm the ID before deleting.',
    inputSchema: {
      id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteRuleGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_rules', {
    title: 'Get Rules',
    description: 'Get all rules from Firefly III across all rule groups.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchRules(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_rule', {
    title: 'Get Rule',
    description: 'Get a single rule by ID, including its triggers and actions. Use get_rules to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Rule ID'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchRule(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_rule', {
    title: 'Create Rule',
    description: 'Create a new rule in Firefly III. A rule has triggers (conditions) and actions (what to do). Use get_rule_groups to find a rule group ID.',
    inputSchema: {
      title: z.string().describe('Rule name'),
      rule_group_id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
      trigger: z.enum(['store-journal', 'update-journal', 'manual-activation']).describe('When the rule fires: store-journal (on new transaction), update-journal (on edit), manual-activation (only when triggered manually)'),
      triggers: z.array(triggerSchema).min(1).describe('At least one trigger condition'),
      actions: z.array(actionSchema).min(1).describe('At least one action to perform when triggers match'),
      description: z.string().optional().describe('Description of the rule'),
      active: z.boolean().optional().default(true).describe('Whether the rule is active'),
      strict: z.boolean().optional().default(true).describe('ALL triggers must match (true) vs ANY trigger is enough (false)'),
      stop_processing: z.boolean().optional().default(false).describe('Skip remaining rules in the group after this rule fires'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createRule(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_rule', {
    title: 'Update Rule',
    description: 'Update an existing rule. Only fields provided will be changed. If triggers or actions arrays are provided they replace the existing ones entirely. Use get_rule to see the current state before updating.',
    inputSchema: {
      id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
      title: z.string().optional().describe('Rule name'),
      rule_group_id: z.string().optional().describe('Move rule to this group ID'),
      trigger: z.enum(['store-journal', 'update-journal', 'manual-activation']).optional().describe('When the rule fires'),
      triggers: z.array(triggerSchema).optional().describe('Replace all triggers with this array'),
      actions: z.array(actionSchema).optional().describe('Replace all actions with this array'),
      description: z.string().optional().describe('Description of the rule'),
      active: z.boolean().optional().describe('Whether the rule is active'),
      strict: z.boolean().optional().describe('ALL triggers must match (true) vs ANY trigger is enough (false)'),
      stop_processing: z.boolean().optional().describe('Skip remaining rules in the group after this rule fires'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateRule(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_rule', {
    title: 'Delete Rule',
    description: 'Permanently delete a rule from Firefly III. **This action cannot be undone.** Use get_rule to confirm before deleting.',
    inputSchema: {
      id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteRule(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('trigger_rule_group', {
    title: 'Trigger Rule Group',
    description: 'Fire all rules in a rule group against your existing transactions. Changes will be applied asynchronously — Firefly III returns immediately and processes in the background. Use get_rule_groups to find valid IDs. Optionally limit to a date range and/or specific account IDs.',
    inputSchema: {
      id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
      start: z.string().optional().describe('Only process transactions on or after this date (YYYY-MM-DD). Both start and end are required together.'),
      end: z.string().optional().describe('Only process transactions on or before this date (YYYY-MM-DD). Both start and end are required together.'),
      accounts: z.array(z.number().int().positive()).optional().describe('Limit to these asset account or liability IDs (other account types are silently ignored)'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ id, start, end, accounts }) => {
    try {
      const result = await triggerRuleGroup(client, id, { start, end, accounts });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('trigger_rule', {
    title: 'Trigger Rule',
    description: 'Fire a single rule against your existing transactions. Changes will be applied asynchronously — Firefly III returns immediately and processes in the background. Use get_rules to find valid IDs. Optionally limit to a date range and/or specific account IDs.',
    inputSchema: {
      id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
      start: z.string().optional().describe('Only process transactions on or after this date (YYYY-MM-DD). Both start and end are required together.'),
      end: z.string().optional().describe('Only process transactions on or before this date (YYYY-MM-DD). Both start and end are required together.'),
      accounts: z.array(z.number().int().positive()).optional().describe('Limit to these asset account or liability IDs'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ id, start, end, accounts }) => {
    try {
      const result = await triggerRule(client, id, { start, end, accounts });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('test_rule_group', {
    title: 'Test Rule Group',
    description: 'Preview which transactions would be affected if the rule group were triggered — no changes are made. Returns a list of matching transactions. Use get_rule_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
      start: z.string().optional().describe('Only test transactions on or after this date (YYYY-MM-DD)'),
      end: z.string().optional().describe('Only test transactions on or before this date (YYYY-MM-DD)'),
      accounts: z.array(z.number().int().positive()).optional().describe('Limit to these asset account or liability IDs'),
      search_limit: z.number().int().positive().max(200).optional().describe('Maximum transactions to scan (default 50, max 200)'),
      triggered_limit: z.number().int().positive().optional().describe('Stop after this many transactions would be triggered (default 50)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, start, end, accounts, search_limit, triggered_limit }) => {
    try {
      const result = await testRuleGroup(client, id, { start, end, accounts, search_limit, triggered_limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('test_rule', {
    title: 'Test Rule',
    description: 'Preview which transactions would be affected if the rule were triggered — no changes are made. Returns a list of matching transactions. Use get_rules to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
      start: z.string().optional().describe('Only test transactions on or after this date (YYYY-MM-DD)'),
      end: z.string().optional().describe('Only test transactions on or before this date (YYYY-MM-DD)'),
      accounts: z.array(z.number().int().positive()).optional().describe('Limit to these asset account or liability IDs'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, start, end, accounts }) => {
    try {
      const result = await testRule(client, id, { start, end, accounts });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
```

- [ ] **Step 2: Update `src/tools/index.ts`**

Replace the entire file:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { registerAccountTools } from './accounts.js';
import { registerTransactionTools } from './transactions.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerBillTools } from './bills.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerReportTools } from './reports.js';
import { registerRecurringTools } from './recurring.js';
import { registerRuleTools } from './rules.js';

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerBudgetTools(server, client);
  registerCategoryTools(server, client);
  registerBillTools(server, client);
  registerPiggyBankTools(server, client);
  registerReportTools(server, client);
  registerRecurringTools(server, client);
  registerRuleTools(server, client);
}
```

- [ ] **Step 3: Run build to verify**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors. `dist/` updated.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/rules.ts src/tools/index.ts dist/
git commit -m "feat: register 14 rule tools and wire into server

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Attachment CRUD and upload functions + tests

**Files:**
- Create: `src/tests/attachments.test.ts`
- Create: `src/tools/attachments.ts` (fetch + CRUD + upload functions, stub register)

- [ ] **Step 1: Create `src/tests/attachments.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchAttachments, fetchAttachment,
  createAttachment, updateAttachment, deleteAttachment, uploadAttachment,
} from '../tools/attachments.js';

const mockClient = {
  get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), postBinary: vi.fn(),
} as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'attachments',
      attributes: {
        filename: 'receipt.pdf',
        title: 'Q1 receipt',
        mime: 'application/pdf',
        size: 48211,
        attachable_type: 'TransactionJournal',
        attachable_id: '5',
      },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '1',
    type: 'attachments',
    attributes: {
      filename: 'receipt.pdf',
      title: 'Q1 receipt',
      mime: 'application/pdf',
      size: 48211,
      attachable_type: 'TransactionJournal',
      attachable_id: '5',
    },
    links: {},
  },
};

describe('fetchAttachments', () => {
  it('calls /attachments with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAttachments(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/attachments', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchAttachments(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toMatchObject({ filename: 'receipt.pdf', id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchAttachment', () => {
  it('calls /attachments/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchAttachment(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/attachments/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchAttachment(mockClient, '1');
    expect(result).toMatchObject({ filename: 'receipt.pdf', id: '1' });
  });
});

describe('createAttachment', () => {
  it('posts to /attachments with required fields', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createAttachment(mockClient, {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '5',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/attachments', {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '5',
    });
  });

  it('includes optional title and notes when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createAttachment(mockClient, {
      filename: 'receipt.pdf',
      attachable_type: 'Bill',
      attachable_id: '3',
      title: 'Q1 receipt',
      notes: 'January invoice',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/attachments', expect.objectContaining({
      title: 'Q1 receipt',
      notes: 'January invoice',
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await createAttachment(mockClient, {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '5',
    });
    expect(result).toMatchObject({ filename: 'receipt.pdf', id: '1' });
  });
});

describe('updateAttachment', () => {
  it('puts to /attachments/:id with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateAttachment(mockClient, '1', { title: 'Updated title' });
    expect(mockClient.put).toHaveBeenCalledWith('/attachments/1', { title: 'Updated title' });
  });
});

describe('deleteAttachment', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteAttachment(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/attachments/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

describe('uploadAttachment', () => {
  it('calls postBinary with the correct path and data', async () => {
    mockClient.postBinary = vi.fn().mockResolvedValueOnce(undefined);
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await uploadAttachment(mockClient, '1', data);
    expect(mockClient.postBinary).toHaveBeenCalledWith('/attachments/1/upload', data);
    expect(result).toEqual({ uploaded: true, id: '1' });
  });

  it('propagates errors from postBinary', async () => {
    mockClient.postBinary = vi.fn().mockRejectedValueOnce(new Error('upload failed'));
    await expect(uploadAttachment(mockClient, '1', new Uint8Array([]))).rejects.toThrow('upload failed');
  });
});
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
npm test -- src/tests/attachments.test.ts
```

Expected: module `../tools/attachments.js` not found; all tests fail.

- [ ] **Step 3: Create `src/tools/attachments.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

export async function fetchAttachments(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/attachments', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchAttachment(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/attachments/${id}`);
  return unwrapSingle(response);
}

export async function createAttachment(
  client: FireflyClient,
  params: {
    filename: string;
    attachable_type: 'Account' | 'Budget' | 'Bill' | 'TransactionJournal' | 'PiggyBank' | 'Tag';
    attachable_id: string;
    title?: string;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/attachments', params);
  return unwrapSingle(response);
}

export async function updateAttachment(
  client: FireflyClient,
  id: string,
  params: { filename?: string; title?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/attachments/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAttachment(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/attachments/${id}`);
  return { deleted: true, id };
}

export async function uploadAttachment(
  client: FireflyClient,
  id: string,
  content: Uint8Array
): Promise<{ uploaded: true; id: string }> {
  await client.postBinary(`/attachments/${id}/upload`, content);
  return { uploaded: true, id };
}

// registerAttachmentTools added in Task 6
export function registerAttachmentTools(_server: McpServer, _client: FireflyClient): void { void z; }
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test -- src/tests/attachments.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/attachments.ts src/tests/attachments.test.ts
git commit -m "feat: add attachment CRUD and upload functions with tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: registerAttachmentTools() and wire index.ts

**Files:**
- Modify: `src/tools/attachments.ts` (replace stub with real implementation)
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Replace the `registerAttachmentTools` stub in `src/tools/attachments.ts`**

Replace the two lines at the bottom of the file:

```typescript
// registerAttachmentTools added in Task 6
export function registerAttachmentTools(_server: McpServer, _client: FireflyClient): void { void z; }
```

With:

```typescript
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerAttachmentTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_attachments', {
    title: 'Get Attachments',
    description: 'Get all file attachments from Firefly III across all objects.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchAttachments(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_attachment', {
    title: 'Get Attachment',
    description: 'Get metadata for a single attachment by ID (filename, title, MIME type, size). Does not return file content. Use get_attachments to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Attachment ID'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchAttachment(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_attachment', {
    title: 'Create Attachment',
    description: 'Create a new attachment record linked to a Firefly III object. This creates only the metadata — call upload_attachment next to send the actual file content.',
    inputSchema: {
      filename: z.string().describe('File name (e.g. "receipt.pdf")'),
      attachable_type: z.enum(['Account', 'Budget', 'Bill', 'TransactionJournal', 'PiggyBank', 'Tag']).describe('The type of object this attachment belongs to'),
      attachable_id: z.string().describe('ID of the object to attach to — use the relevant get_* tool to find valid IDs'),
      title: z.string().optional().describe('Human-readable title for the attachment'),
      notes: z.string().optional().describe('Notes about the attachment'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createAttachment(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_attachment', {
    title: 'Update Attachment',
    description: 'Update an attachment\'s metadata (filename, title, notes). Does not affect stored file content. Use get_attachments to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
      filename: z.string().optional().describe('New file name'),
      title: z.string().optional().describe('New title'),
      notes: z.string().optional().describe('New notes'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateAttachment(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_attachment', {
    title: 'Delete Attachment',
    description: 'Permanently delete an attachment and its stored file data from Firefly III. **This action cannot be undone.** Use get_attachments to confirm the ID before deleting.',
    inputSchema: {
      id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteAttachment(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('upload_attachment', {
    title: 'Upload Attachment',
    description: 'Upload file content for an existing attachment. Call create_attachment first to get an attachment ID, then call this with the base64-encoded file content. Replaces any previously uploaded content.',
    inputSchema: {
      id: z.string().describe('Attachment ID from create_attachment'),
      content_base64: z.string().describe('Base64-encoded file content'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ id, content_base64 }) => {
    try {
      const bytes = Buffer.from(content_base64, 'base64');
      const result = await uploadAttachment(client, id, bytes);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
```

- [ ] **Step 2: Update `src/tools/index.ts`**

Replace the entire file:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { registerAccountTools } from './accounts.js';
import { registerTransactionTools } from './transactions.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerBillTools } from './bills.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerReportTools } from './reports.js';
import { registerRecurringTools } from './recurring.js';
import { registerRuleTools } from './rules.js';
import { registerAttachmentTools } from './attachments.js';

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerBudgetTools(server, client);
  registerCategoryTools(server, client);
  registerBillTools(server, client);
  registerPiggyBankTools(server, client);
  registerReportTools(server, client);
  registerRecurringTools(server, client);
  registerRuleTools(server, client);
  registerAttachmentTools(server, client);
}
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors. `dist/` updated.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/attachments.ts src/tools/index.ts dist/
git commit -m "feat: register 6 attachment tools and wire into server

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Mark roadmap items complete in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark both items done in CLAUDE.md**

In the `### Medium Priority` section of `CLAUDE.md`, change:

```markdown
- [ ] **Automation rules & rule groups**
```
to:
```markdown
- [x] **Automation rules & rule groups**
```

And:

```markdown
- [ ] **File attachments**
```
to:
```markdown
- [x] **File attachments**
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark automation rules and file attachments complete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
