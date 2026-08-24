import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatError } from '../client.js';

type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export function defineTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  fetch: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  // registerTool is generic in the SDK; the cast avoids fighting its complex overload resolution
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, async (args: Record<string, unknown>) => {
    try {
      const result = await fetch(args);
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}

/** A pre-built MCP tool result. Used by tools that return native content blocks
 * (e.g. an `image` block) instead of letting {@link defineTool} JSON-stringify a
 * plain value into a single text block. */
export type ContentResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
};

/**
 * Like {@link defineTool}, but the handler returns a ready-made MCP result
 * (content blocks) rather than a plain value. Error handling is identical:
 * thrown errors become an `isError` text block via {@link formatError}.
 */
export function defineContentTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  fetch: (args: Record<string, unknown>) => Promise<ContentResult>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, async (args: Record<string, unknown>) => {
    try {
      return await fetch(args);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/**
 * Appended to every tool field that takes a category *name* rather than an id.
 *
 * Firefly III matches category names by exact string and stores whatever it is given verbatim, so a
 * name copied out of a rendered web page ("Restaurants &amp; cafés") silently becomes a second
 * category alongside the real "Restaurants & cafés" — the two look identical wherever they are
 * rendered. Decoding entities on the way out was considered and rejected: it is lossy and
 * unavoidable, since a category legitimately named "Restaurants &amp; cafés" would then be
 * unreachable. Warning the caller is the only option that cannot corrupt a valid name.
 */
export const CATEGORY_NAME_HINT =
  'Matched by exact string — pass literal text, since HTML entities like &amp; or &#039; are not decoded and would create a separate category.';

const dateTimeSchema = z.iso.datetime({ offset: true });
export const dateOrDateTimeSchema = z
  .string()
  .refine((value) => dateSchema.safeParse(value).success || dateTimeSchema.safeParse(value).success, {
    message: 'Date must be YYYY-MM-DD or an RFC 3339 date-time with timezone',
  });

/**
 * Extracts a leading numeric ID from an autocomplete label such as `"42 (Checking - asset)"`.
 *
 * This relies on the completion-label format (the numeric ID always comes first). When the value
 * has no leading digits it is returned unchanged. Note that a free-typed value like `"42 Main St"`
 * would resolve to `"42"`, so callers should prefer values picked from autocomplete suggestions
 * rather than arbitrary user input.
 */
export function parseId(id: string): string {
  const match = id.match(/^(\d+)/);
  return match ? match[1] : id;
}

// Autocomplete tuning shared by every completion handler.
export const AUTOCOMPLETE_FETCH_LIMIT = 1000; // max records pulled from the API per refresh
export const AUTOCOMPLETE_MAX_SUGGESTIONS = 100; // max labels returned to the client per keystroke
const AUTOCOMPLETE_CACHE_TTL_MS = 60_000; // 1 minute

const DEBUG_ENABLED = process.env.FIREFLY_DEBUG === 'true' || process.env.FIREFLY_DEBUG === '1';

/**
 * Writes to stderr only when FIREFLY_DEBUG is set. Never touches stdout, so it is safe under the
 * stdio transport. Used for the verbose autocomplete tracing that would otherwise fire on every
 * keystroke (and echo user search terms) in normal operation.
 */
export function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) console.error(...args);
}

interface CacheEntry<T> {
  promise: Promise<T>;
  fetchedAt: number;
}

export interface TtlCache<T> {
  /**
   * Returns the cached promise for `key` if it is still fresh, otherwise runs `fetchFn`, caches the
   * resulting promise, and returns it. Promise-level caching collapses the burst of concurrent
   * requests that autocomplete fires during rapid typing into a single fetch. A rejected promise is
   * evicted so the next call retries instead of replaying a cached failure.
   */
  get(key: string, fetchFn: () => Promise<T>): Promise<T>;
  /** Drops all cached entries. */
  clear(): void;
}

/**
 * Creates a module-scoped TTL cache keyed by an opaque identity string. The key MUST scope entries
 * per authenticated user (e.g. a hash of the bearer token): in HTTP mode a single client instance
 * serves every request, so an unkeyed cache would leak one user's data to another.
 */
export function createTtlCache<T>(ttlMs = AUTOCOMPLETE_CACHE_TTL_MS): TtlCache<T> {
  const entries = new Map<string, CacheEntry<T>>();
  return {
    get(key: string, fetchFn: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const existing = entries.get(key);
      if (existing && now - existing.fetchedAt <= ttlMs) return existing.promise;
      const promise = fetchFn().catch((err) => {
        // Evict the failed promise so a later attempt re-fetches rather than caching the rejection.
        if (entries.get(key)?.promise === promise) entries.delete(key);
        throw err;
      });
      entries.set(key, { promise, fetchedAt: now });
      return promise;
    },
    clear(): void {
      entries.clear();
    },
  };
}
