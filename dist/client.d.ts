import type { QueryParams } from './types.js';
export declare class FireflyError extends Error {
    readonly status: number;
    readonly url: string;
    constructor(status: number, url: string, body: string);
}
export declare function formatError(err: unknown): string;
export declare class FireflyClient {
    private readonly token;
    private readonly baseUrl;
    private readonly timeoutMs;
    constructor(baseUrl: string, token: string);
    get<T = unknown>(path: string, params?: QueryParams): Promise<T>;
}
//# sourceMappingURL=client.d.ts.map