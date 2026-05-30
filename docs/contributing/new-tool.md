# Adding a new tool

## Overview

Each tool lives in a file under `src/tools/`. Each file exports a `registerXxxTools(server, client)` function that calls `server.registerTool()` for each tool it owns.

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

In the `registerXxxTools(server, client)` function of the same file:

```typescript
server.registerTool(
  'get_my_thing',
  {
    title: 'Get My Thing',
    description: 'Get a single my-thing by ID.',
    inputSchema: {
      id: z.string().describe('My-thing ID'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id }) => {
    try {
      const result = await fetchMyThing(client, id)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true }
    }
  }
)
```

Use `READ_ANNOTATIONS` for read-only tools. See `AGENTS.md` for write tool annotations.

## Step 5: Wire a new group (if creating a new tool file)

If the tool belongs to a new group file:

1. Add the group name to `TOOL_GROUPS` in `src/tools/index.ts`
2. Import and call `registerXxxTools` inside `registerAllTools`
3. Consider which presets it belongs in (`PRESETS` map in the same file)

## Step 6: Update docs

Add the tool to the table in `docs/reference/tools.md` and `README.md`.

## Step 7: Build and commit

```bash
npm run build    # verify TypeScript compiles
npm test         # verify all tests pass
git add src/tools/my-category.ts src/tests/my-category.test.ts docs/reference/tools.md README.md
git commit -m "feat: add get_my_thing tool"
```
