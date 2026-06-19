import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatError } from '../client.js';

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
