# Adding a new tool

## Overview

Each tool lives in a file under `src/tools/`. Each file exports a `registerXxxTools(server, client)` function that calls `defineTool()` for each tool it owns. `defineTool` (in `src/tools/_helpers.js`) is a thin wrapper over `server.registerTool()` that adds the `try/catch` and JSON serialization every tool needs — so handlers just return a plain value.

## Step 1: Check the Firefly III API spec

Before implementing, verify field names, required/optional status, and response shapes against the OpenAPI spec:

```bash
curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0" \
  | grep -A 100 "YourSchema:"
```

Field names in the docs summaries frequently differ from what the spec actually requires. The spec is authoritative.

## Step 2: Write a failing test

In `src/tests/{category}.test.ts`, add a test using a realistic JSON:API envelope fixture:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { fetchMyThing } from '../tools/my-category.js'
import type { JsonApiSingleResponse } from '../transform.js'

const fixture: JsonApiSingleResponse = {
  data: {
    id: '42',
    type: 'my-things',
    attributes: { name: 'Example', some_field: 'value' },
    links: {},
  },
}

describe('fetchMyThing', () => {
  it('returns flattened attributes with id', async () => {
    const mockClient = { get: vi.fn().mockResolvedValueOnce(fixture) } as any
    const result = await fetchMyThing(mockClient, '42')
    expect(mockClient.get).toHaveBeenCalledWith('/my-things/42', undefined)
    expect(result).toEqual({ name: 'Example', some_field: 'value', id: '42' })
  })
})
```

Run it to confirm it fails: `npm test -- --reporter=verbose src/tests/my-category.test.ts`

## Step 3: Implement the fetch function

In `src/tools/{category}.ts`:

```typescript
import { unwrapSingle, type JsonApiSingleResponse, type UnwrappedSingle } from '../transform.js'
import type { FireflyClient } from '../client.js'

export async function fetchMyThing(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/my-things/${id}`)
  return unwrapSingle(response)
}
```

Use `unwrapList` + `JsonApiListResponse` for list endpoints, `unwrapSingle` + `JsonApiSingleResponse` for single-item endpoints.

Run the test again to confirm it passes.

## Step 4: Register the tool

In the `registerXxxTools(server, client)` function of the same file, call `defineTool`. The handler just returns the fetch result — `defineTool` adds the `try/catch` and JSON serialization for you:

```typescript
import { defineTool } from './_helpers.js'
import { READ_ANNOTATIONS } from './_annotations.js'

// inside registerXxxTools(server, client):
defineTool(
  server,
  'get_my_thing',
  {
    title: 'Get My Thing',
    description: 'Get a single my-thing by ID.',
    inputSchema: {
      id: z.string().describe('My-thing ID'),
    },
    annotations: READ_ANNOTATIONS,
  },
  ({ id }) => fetchMyThing(client, id), // args are typed from inputSchema — no casts needed
)
```

Annotation constants live in `src/tools/_annotations.ts`: `READ_ANNOTATIONS` for read-only tools, `WRITE_ANNOTATIONS` (create), `UPDATE_ANNOTATIONS` (update), and `DELETE_ANNOTATIONS` (delete). For a tool that returns native content blocks instead of a JSON-serialized value (e.g. an `image`), use `defineContentTool` and return a ready-made `{ content: [...] }` result.

## Step 5: Wire a new group (if creating a new tool file)

If the tool belongs to a new group file:

1. Add the group name to `TOOL_GROUPS` in `src/tools/index.ts`
2. Import and call `registerXxxTools` inside `registerAllTools`
3. Consider which presets it belongs in (`PRESETS` map in the same file)

## Step 6: Update docs

1. Add the tool to the table in `docs/reference/tools.md` — the canonical tool reference. (The README links to it and no longer keeps its own table.)
2. If you changed the total tool count or a preset's count, update the hardcoded numbers. The total ("140 tools") is repeated in `README.md`, `docs/index.md`, `docs/guide/index.md`, `docs/guide/stdio.md`, `docs/reference/tools.md`, and `docs/reference/filtering.md`. Preset counts live in the tables in `docs/reference/filtering.md` and `AGENTS.md`.

## Step 7: Build and commit

```bash
npm run build    # verify TypeScript compiles
npm test         # verify all tests pass
git add src/tools/my-category.ts src/tests/my-category.test.ts docs/reference/tools.md
git commit -m "feat: add get_my_thing tool"
```
