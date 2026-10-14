import { createHash } from 'node:crypto';
import type { QueryParams } from './types.js';

export class FireflyError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`Firefly III API error ${status} at ${url.split('?')[0]}: ${body}`);
    this.name = 'FireflyError';
  }
}

function parseFieldErrors(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { errors?: Record<string, string[]> };
    if (parsed.errors && Object.keys(parsed.errors).length > 0) {
      return Object.entries(parsed.errors)
        .map(([field, msgs]) => `${field} — ${msgs.join(', ')}`)
        .join('; ');
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Extract a filename from a Content-Disposition header. Handles the RFC 5987
 * extended form (`filename*=UTF-8''…`, percent-decoded) and the plain
 * `filename=` form (quoted or unquoted, used verbatim). Returns "file" when no
 * usable filename is present. `decodeURIComponent` is applied only to the
 * extended form — a plain filename containing a literal "%" must not be decoded.
 */
export function parseContentDispositionFilename(header: string | null | undefined): string {
  if (!header) return 'file';
  const extended = header.match(/filename\*=(?:[\w-]+'[^']*')?([^;]+)/i);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^["']|["']$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw; // malformed percent-encoding — fall back to the raw value
    }
  }
  const plain = header.match(/filename=("([^"]*)"|([^;]+))/i);
  const value = (plain?.[2] ?? plain?.[3] ?? '').trim();
  return value || 'file';
}

/**
 * Refuses an API path that could address something other than what it spells out. Tool arguments end
 * up in these paths, and `new URL()` resolves dot segments (also percent-encoded ones) before the
 * request is sent, so an ID of `../budgets/5` turned DELETE /accounts/{id} into DELETE /budgets/5,
 * and enough `../` left /api/v1 entirely with the token attached. `?` and `#` would smuggle in a
 * query or cut the path short; a backslash is treated as a slash by URL parsers.
 */
export function assertSafeApiPath(path: string): void {
  const segments = path.split('/');
  // Control characters matter as well: URL parsers silently strip tabs and newlines, so `.\n.` would
  // pass the segment check below and still be resolved as `..`.
  const hasControlCharacter = [...path].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);
  const unsafe =
    !path.startsWith('/') ||
    hasControlCharacter ||
    /[?#\\]/.test(path) ||
    segments.some((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return true; // malformed percent-encoding
      }
      return decoded === '.' || decoded === '..';
    });
  if (unsafe) throw new Error(`Refusing to call an unsafe Firefly III API path: ${JSON.stringify(path)}`);
}

/** A response body larger than the caller's limit. `size` is set when Content-Length declared it. */
export class ResponseTooLargeError extends Error {
  constructor(
    readonly limit: number,
    readonly size?: number,
  ) {
    super(
      size === undefined
        ? `Response exceeds the ${limit}-byte limit.`
        : `Response is ${size} bytes, over the ${limit}-byte limit.`,
    );
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Reads a response body, giving up as soon as it passes `maxBytes`: a declared Content-Length is
 * checked before reading anything, and the stream is cancelled mid-way otherwise, so an oversized
 * file is never downloaded in full.
 */
async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('Content-Length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(maxBytes, declared);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function formatError(err: unknown): string {
  if (err instanceof FireflyError) {
    if (err.status === 400) {
      const details = parseFieldErrors(err.body);
      return details ? `Bad request: ${details}` : 'Bad request — check your input parameters.';
    }
    // Worded for both transports: stdio authenticates with FIREFLY_TOKEN, while HTTP mode never
    // reads it and forwards the caller's own Bearer token instead.
    if (err.status === 401) {
      return 'Authentication failed: Firefly III rejected the access token. Over stdio, check FIREFLY_TOKEN; over HTTP, re-authenticate or check the Bearer token your MCP client sends.';
    }
    if (err.status === 404) return 'Resource not found.';
    if (err.status >= 300 && err.status < 400) {
      return 'Firefly III redirected the request instead of answering it. Check that FIREFLY_URL points at Firefly III itself (not a login page or proxy).';
    }
    if (err.status === 422) {
      const details = parseFieldErrors(err.body);
      return details ? `Validation failed: ${details}` : 'Invalid request parameters.';
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

  constructor(
    baseUrl: string,
    private readonly tokenResolver: string | (() => string),
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getToken(): string {
    return typeof this.tokenResolver === 'function' ? this.tokenResolver() : this.tokenResolver;
  }

  /**
   * Stable, non-reversible per-identity key derived from the current bearer token. Used to scope
   * in-memory caches per user — essential in HTTP mode, where one client instance serves every
   * request and the token is resolved per request from the async context.
   */
  cacheKey(): string {
    return createHash('sha256').update(this.getToken()).digest('hex');
  }

  private buildUrl(path: string, params?: QueryParams): string {
    assertSafeApiPath(path);
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

  /**
   * Performs one request and reads its body under a single timeout. The timer must stay armed
   * until `read` finishes: `fetch` resolves as soon as the response headers arrive, so a timer
   * cleared at that point left a stalled body able to hang the tool call indefinitely.
   */
  private async send<T>(url: string, init: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Never follow redirects. A Firefly III API route only redirects when something is wrong (Laravel
      // answers a failed validation on a request that did not ask for JSON with a 302 to the home
      // page), and following it handed that HTML page back as if it were the result.
      const response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        throw new FireflyError(response.status, url, responseBody);
      }
      return await read(response);
    } catch (err) {
      if (!(err instanceof FireflyError) && controller.signal.aborted) {
        // Query strings can carry search terms; keep them out of the message (as FireflyError does).
        throw new Error(`Request to ${url.split('?')[0]} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    return this.send(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      async (response) => (response.status === 204 ? (undefined as T) : ((await response.json()) as T)),
    );
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>('GET', this.buildUrl(path, params));
  }

  async post<T = unknown>(path: string, body: unknown, params?: QueryParams): Promise<T> {
    return this.request<T>('POST', this.buildUrl(path, params), body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', this.buildUrl(path), body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', this.buildUrl(path));
  }

  async postBinary(path: string, body: Uint8Array): Promise<void> {
    await this.send(
      this.buildUrl(path),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          'Content-Type': 'application/octet-stream',
        },
        body: body as BodyInit,
      },
      async () => undefined,
    );
  }

  // getText and getBinary ask for JSON even though the body is CSV or a file: Firefly III serves these
  // routes either way, and only a request that accepts JSON gets a 422 with the reason when its
  // input is rejected (anything else gets an HTML redirect).

  /** Text body; with `maxBytes`, throws ResponseTooLargeError instead of reading past the limit. */
  async getText(path: string, params?: QueryParams, options: { maxBytes?: number } = {}): Promise<string> {
    const { maxBytes } = options;
    return this.send(
      this.buildUrl(path, params),
      { method: 'GET', headers: { Authorization: `Bearer ${this.getToken()}`, Accept: 'application/json' } },
      async (response) =>
        maxBytes === undefined ? response.text() : (await readLimited(response, maxBytes)).toString('utf8'),
    );
  }

  /**
   * Binary body plus its metadata. `maxBytes` may depend on the Content-Type (known once headers
   * arrive); past it, ResponseTooLargeError is thrown without downloading the rest.
   */
  async getBinary(
    path: string,
    params?: QueryParams,
    options: { maxBytes?: number | ((contentType: string) => number) } = {},
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    return this.send(
      this.buildUrl(path, params),
      { method: 'GET', headers: { Authorization: `Bearer ${this.getToken()}`, Accept: 'application/json' } },
      async (response) => {
        const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
        const limit = typeof options.maxBytes === 'function' ? options.maxBytes(contentType) : options.maxBytes;
        return {
          data: limit === undefined ? Buffer.from(await response.arrayBuffer()) : await readLimited(response, limit),
          contentType,
          filename: parseContentDispositionFilename(response.headers.get('Content-Disposition')),
        };
      },
    );
  }
}
