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
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}/api/v1${path}`, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}/api/v1${path}`, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', `${this.baseUrl}/api/v1${path}`);
  }
}
