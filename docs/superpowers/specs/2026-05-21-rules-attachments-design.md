# Design: Automation Rules & Rule Groups + File Attachments

**Date:** 2026-05-21  
**Status:** Approved  
**Scope:** Two new tool files (`rules.ts`, `attachments.ts`), minor client/types extension, two test files, index wiring.

---

## Overview

Implements two medium-priority roadmap items in parallel:

1. **Automation rules & rule groups** — CRUD for rules and rule groups, plus trigger (fire) and test (dry-run) operations.
2. **File attachments** — CRUD for attachment metadata, plus binary file upload.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/tools/rules.ts` | 14 tools: rule-group CRUD (5), rule CRUD (5), trigger (2), test (2) |
| `src/tools/attachments.ts` | 6 tools: attachment CRUD (5) + binary upload (1) |
| `src/tests/rules.test.ts` | Unit tests for all rules fetch/write/action functions |
| `src/tests/attachments.test.ts` | Unit tests for all attachment fetch/write/upload functions |

### Modified files

| File | Change |
|---|---|
| `src/types.ts` | Extend `QueryParams` to support `number[]` values |
| `src/client.ts` | Array support in `get()` URL builder; optional `params` on `post()`; new `postBinary()` method |
| `src/tools/index.ts` | Import and call `registerRuleTools` and `registerAttachmentTools` |

---

## Client & Types Changes

### `src/types.ts`

```typescript
export type QueryParams = Record<string, string | number | number[] | undefined>;
```

### `src/client.ts`

**`get()` URL builder** — handle array values with repeated query params:
```typescript
if (Array.isArray(value)) {
  for (const v of value) url.searchParams.append(key, String(v));
} else {
  url.searchParams.set(key, String(value));
}
```

**`post()` signature** — add optional query params for trigger endpoints (POST with no body):
```typescript
async post<T = unknown>(path: string, body: unknown, params?: QueryParams): Promise<T>
```

**`postBinary()` method** — new method for `application/octet-stream` uploads:
```typescript
async postBinary(path: string, body: Uint8Array): Promise<void>
```
Sets `Content-Type: application/octet-stream`, sends raw bytes, expects 204, returns `void`.

---

## Section 1: `src/tools/rules.ts`

### Fetch functions

```typescript
fetchRuleGroups(client, { page?, limit? }) → UnwrappedList
fetchRuleGroup(client, id) → UnwrappedSingle
fetchRules(client, { page?, limit? }) → UnwrappedList
fetchRule(client, id) → UnwrappedSingle
```

### Write functions

```typescript
createRuleGroup(client, { title, description?, active? }) → UnwrappedSingle
updateRuleGroup(client, id, { title?, description?, active? }) → UnwrappedSingle
deleteRuleGroup(client, id) → { deleted: true; id: string }

createRule(client, { title, rule_group_id, trigger, triggers[], actions[], description?, active?, strict?, stop_processing? }) → UnwrappedSingle
updateRule(client, id, { title?, rule_group_id?, trigger?, triggers[]?, actions[]?, description?, active?, strict?, stop_processing? }) → UnwrappedSingle
deleteRule(client, id) → { deleted: true; id: string }
```

### Action functions

```typescript
triggerRuleGroup(client, id, { start?, end?, accounts?: number[] }) → { triggered: true; id: string }
triggerRule(client, id, { start?, end?, accounts?: number[] }) → { triggered: true; id: string }
testRuleGroup(client, id, { start?, end?, accounts?: number[], search_limit?, triggered_limit? }) → UnwrappedList
testRule(client, id, { start?, end?, accounts?: number[], search_limit?, triggered_limit? }) → UnwrappedList
```

Trigger functions call `client.post(path, undefined, params)` — POST with query params and no body. Response is 204; function returns `{ triggered: true; id }`.

The `accounts` Zod input field (type `number[]`) maps to the QueryParams key `'accounts[]'` so the URL builder emits repeated `accounts[]=1&accounts[]=2` params as required by the API.

Test functions call `client.get()` and pipe through `unwrapList`.

### Tool list (14)

| Tool name | Kind | Annotations |
|---|---|---|
| `get_rule_groups` | read | `READ_ANNOTATIONS` |
| `get_rule_group` | read | `READ_ANNOTATIONS` |
| `create_rule_group` | write | `WRITE_ANNOTATIONS` |
| `update_rule_group` | write | `UPDATE_ANNOTATIONS` |
| `delete_rule_group` | write | `DELETE_ANNOTATIONS` |
| `get_rules` | read | `READ_ANNOTATIONS` |
| `get_rule` | read | `READ_ANNOTATIONS` |
| `create_rule` | write | `WRITE_ANNOTATIONS` |
| `update_rule` | write | `UPDATE_ANNOTATIONS` |
| `delete_rule` | write | `DELETE_ANNOTATIONS` |
| `trigger_rule_group` | action | `{ openWorldHint: true }` |
| `trigger_rule` | action | `{ openWorldHint: true }` |
| `test_rule_group` | read | `READ_ANNOTATIONS` |
| `test_rule` | read | `READ_ANNOTATIONS` |

### Trigger & action array schemas (Zod)

Used in `create_rule` and `update_rule` input schemas.

**Trigger object:**
```typescript
z.object({
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
  ]),
  value: z.string().describe('Value the trigger matches against'),
  prohibited: z.boolean().optional().describe('Negate this trigger (IS becomes IS NOT)'),
  active: z.boolean().optional().default(true),
  stop_processing: z.boolean().optional().default(false),
  order: z.number().int().optional(),
})
```

**Action object:**
```typescript
z.object({
  type: z.enum([
    'user_action', 'set_category', 'clear_category', 'set_budget', 'clear_budget',
    'add_tag', 'remove_tag', 'remove_all_tags',
    'set_description', 'append_description', 'prepend_description',
    'set_source_account', 'set_destination_account',
    'set_notes', 'append_notes', 'prepend_notes', 'clear_notes',
    'link_to_bill', 'convert_withdrawal', 'convert_deposit', 'convert_transfer',
    'delete_transaction',
  ]),
  value: z.string().nullable().describe('Value for the action (empty string for clear/boolean actions)'),
  active: z.boolean().optional().default(true),
  stop_processing: z.boolean().optional().default(false),
  order: z.number().int().optional(),
})
```

---

## Section 2: `src/tools/attachments.ts`

### Fetch functions

```typescript
fetchAttachments(client, { page?, limit? }) → UnwrappedList
fetchAttachment(client, id) → UnwrappedSingle
createAttachment(client, { filename, attachable_type, attachable_id, title?, notes? }) → UnwrappedSingle
updateAttachment(client, id, { filename?, title?, notes? }) → UnwrappedSingle
deleteAttachment(client, id) → { deleted: true; id: string }
uploadAttachment(client, id, content: Uint8Array) → { uploaded: true; id: string }
```

`uploadAttachment` calls `client.postBinary(`/attachments/${id}/upload`, content)`.

### Tool list (6)

| Tool name | Kind | Notes |
|---|---|---|
| `get_attachments` | read | `READ_ANNOTATIONS` |
| `get_attachment` | read | `READ_ANNOTATIONS` |
| `create_attachment` | write | `WRITE_ANNOTATIONS` — creates metadata only, no file content |
| `update_attachment` | write | `UPDATE_ANNOTATIONS` |
| `delete_attachment` | write | `DELETE_ANNOTATIONS` — deletes metadata and file data |
| `upload_attachment` | write | `{ openWorldHint: true }` — accepts `content_base64`, decodes inline to `Uint8Array` before calling `postBinary` |

**`attachable_type` enum:** `Account | Budget | Bill | TransactionJournal | PiggyBank | Tag`

**Two-step upload workflow** (described in tool descriptions):
1. Call `create_attachment` with `filename`, `attachable_type`, `attachable_id` → returns attachment ID
2. Call `upload_attachment` with that ID and base64-encoded file content

---

## Testing Strategy

### `src/tests/rules.test.ts`

- Fixtures use full JSON:API envelopes: `{ data: [{ id, type: 'rules', attributes: {...}, links: {} }], meta: { pagination: {...} } }`
- `fetchRuleGroups`, `fetchRuleGroup`, `fetchRules`, `fetchRule`: mock `client.get`, assert call path + unwrapped shape
- `createRuleGroup`, `createRule`, etc.: mock `client.post`, assert body shape + unwrapped response
- `updateRuleGroup`, `updateRule`: mock `client.put`, assert partial body + response
- `deleteRuleGroup`, `deleteRule`: mock `client.delete`, assert `{ deleted: true, id }`
- `triggerRuleGroup`, `triggerRule`: mock `client.post` returning `undefined`, assert `{ triggered: true, id }` and that params are forwarded
- `testRuleGroup`, `testRule`: mock `client.get` with a transaction array fixture, assert `unwrapList` output

### `src/tests/attachments.test.ts`

- `fetchAttachments`, `fetchAttachment`: mock `client.get` with JSON:API fixtures
- `createAttachment`, `updateAttachment`: mock `client.post`/`client.put`
- `deleteAttachment`: mock `client.delete`, assert `{ deleted: true, id }`
- `uploadAttachment`: mock `client.postBinary`, assert it receives the `Uint8Array` correctly decoded from the base64 input

---

## Wiring (`src/tools/index.ts`)

```typescript
import { registerRuleTools } from './rules.js';
import { registerAttachmentTools } from './attachments.js';

// inside registerAllTools():
registerRuleTools(server, client);
registerAttachmentTools(server, client);
```

---

## Error Handling

All tool handlers follow the existing pattern: `try/catch` wrapping, `formatError(err)` on failure, `isError: true` on the returned content block.

---

## Out of Scope

- `GET /rule-groups/{id}/rules` (list rules in a group) — omitted; `get_rules` already returns all rules and Firefly's API doesn't filter by group via that endpoint
- `accounts[]` filter on test/trigger: included via `number[]` QueryParams support
- Download attachment content (`GET /attachments/{id}/download`) — binary response; not useful as MCP text output; omitted
