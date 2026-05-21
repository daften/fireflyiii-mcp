import type { QueryParams } from './types.js';
export declare class FireflyError extends Error {
    readonly status: number;
    readonly url: string;
    readonly body: string;
    constructor(status: number, url: string, body: string);
}
export declare function formatError(err: unknown): string;
export declare class FireflyClient {
    private readonly tokenResolver;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(baseUrl: string, tokenResolver: string | (() => string));
    private getToken;
    private buildUrl;
    private rawFetch;
    private request;
    get<T = unknown>(path: string, params?: QueryParams): Promise<T>;
    post<T = unknown>(path: string, body: unknown, params?: QueryParams): Promise<T>;
    put<T = unknown>(path: string, body: unknown): Promise<T>;
    delete(path: string): Promise<void>;
    postBinary(path: string, body: Uint8Array): Promise<void>;
    getText(path: string, params?: QueryParams): Promise<string>;
}
//# sourceMappingURL=client.d.ts.map