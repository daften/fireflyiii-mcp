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

export function formatError(err: unknown): string {
  if (err instanceof FireflyError) {
    if (err.status === 400) {
      const details = parseFieldErrors(err.body);
      return details ? `Bad request: ${details}` : 'Bad request — check your input parameters.';
    }
    if (err.status === 401) return 'Authentication failed. Check your FIREFLY_TOKEN.';
    if (err.status === 404) return 'Resource not found.';
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

  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
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
    return response;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await this.rawFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
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
    return this.request<T>('PUT', this.buildUrl(path), body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', this.buildUrl(path));
  }

  async postBinary(path: string, body: Uint8Array): Promise<void> {
    await this.rawFetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        'Content-Type': 'application/octet-stream',
      },
      body: body as BodyInit,
    });
  }

  async getText(path: string, params?: QueryParams): Promise<string> {
    const response = await this.rawFetch(this.buildUrl(path, params), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        Accept: '*/*',
      },
    });
    return response.text();
  }

  async getBinary(
    path: string,
    params?: QueryParams,
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    const response = await this.rawFetch(this.buildUrl(path, params), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        Accept: '*/*',
      },
    });
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
    const filename = parseContentDispositionFilename(response.headers.get('Content-Disposition'));
    return { data, contentType, filename };
  }
}
