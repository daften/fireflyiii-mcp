import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatError } from '../client.js';
import type { QueryParams } from '../types.js';

/** Raw shape accepted as a tool input schema (mutable variant of z.ZodRawShape). */
export type ToolShape = Record<string, z.ZodType>;

/** Handler argument type inferred from a shape. */
export type ToolArgs<Shape extends ToolShape> = z.infer<z.ZodObject<Shape>>;

type ToolConfig<Shape extends ToolShape> = {
  title?: string;
  description?: string;
  inputSchema?: Shape;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

// The generic overload gives call sites handler args inferred from their inputSchema; the
// implementation signature widens the config so the SDK's conditional ToolCallback type
// resolves to a concrete function type (it stays deferred over an unresolved type parameter).
export function defineTool<Shape extends ToolShape>(
  server: McpServer,
  name: string,
  config: ToolConfig<Shape>,
  fetch: (args: ToolArgs<Shape>) => Promise<unknown>,
): void;
export function defineTool(
  server: McpServer,
  name: string,
  config: ToolConfig<ToolShape>,
  fetch: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  server.registerTool(name, config, async (args: Record<string, unknown>) => {
    try {
      const result = await fetch(args);
      return {
        content: [
          {
            type: 'text' as const,
            // Compact: indentation adds roughly a third more tokens to every result for no gain to the model.
            text: typeof result === 'string' ? result : JSON.stringify(result),
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
export function defineContentTool<Shape extends ToolShape>(
  server: McpServer,
  name: string,
  config: ToolConfig<Shape>,
  fetch: (args: ToolArgs<Shape>) => Promise<ContentResult>,
): void;
export function defineContentTool(
  server: McpServer,
  name: string,
  config: ToolConfig<ToolShape>,
  fetch: (args: Record<string, unknown>) => Promise<ContentResult>,
): void {
  server.registerTool(name, config, async (args: Record<string, unknown>) => {
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
 * A numeric Firefly III ID that ends up in a URL path. Validating it here is what stops a value like
 * `../budgets/5` (which `new URL()` would resolve to a different resource) from reaching a request.
 * `FireflyClient` refuses such paths as well; this check gives the model a clear message first.
 */
export const idSchema = z.string().regex(/^\d+$/, 'Must be a numeric Firefly III ID');

/**
 * Extracts the leading numeric ID from an autocomplete label such as `"42 (Checking - asset)"`, or
 * returns a plain numeric ID unchanged.
 *
 * Relies on the completion-label format (the numeric ID always comes first). A free-typed value like
 * `"42 Main St"` resolves to `"42"`, so callers should prefer values picked from autocomplete
 * suggestions. A value with no leading number is rejected rather than passed through: it would end up
 * verbatim in a URL path.
 */
export function parseId(id: string): string {
  const match = id.match(/^(\d+)/);
  if (!match)
    throw new Error(`"${id}" is not a valid ID: expected a number, or an autocomplete label that starts with one.`);
  return match[1];
}

/**
 * Builds the query params shared by `/transactions` and `/accounts/{id}/transactions` —
 * both endpoints accept the same type/start/end/page/limit filters. A future Firefly
 * filter added here reaches both call sites instead of needing to be hand-added twice.
 */
export function buildTransactionListQuery(params: {
  type?: string;
  start?: string;
  end?: string;
  page?: number;
  limit?: number;
}): QueryParams {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query.type = params.type;
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  return query;
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
  /** Number of entries currently held (fresh or not yet swept). */
  size(): number;
}

// Upper bound on distinct identities a cache holds at once. Every refreshed OAuth access token is a
// new identity, so without a bound (and without sweeping expired entries) a long-running HTTP server
// accumulated one stale entry, of up to AUTOCOMPLETE_FETCH_LIMIT records, per token it ever saw.
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = 256;

/**
 * Creates a module-scoped TTL cache keyed by an opaque identity string. The key MUST scope entries
 * per authenticated user (e.g. a hash of the bearer token): in HTTP mode a single client instance
 * serves every request, so an unkeyed cache would leak one user's data to another.
 *
 * Expired entries are swept whenever a new one is stored, and at most `maxEntries` are kept (the
 * least recently stored is dropped first), so memory stays bounded however many identities pass.
 */
export function createTtlCache<T>(
  ttlMs = AUTOCOMPLETE_CACHE_TTL_MS,
  maxEntries = AUTOCOMPLETE_CACHE_MAX_ENTRIES,
): TtlCache<T> {
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
      for (const [k, entry] of entries) {
        if (now - entry.fetchedAt > ttlMs) entries.delete(k);
      }
      // Re-inserting moves the key to the end of the Map's insertion order, which is what the
      // oldest-first eviction below relies on.
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { promise, fetchedAt: now });
      return promise;
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
  };
}
