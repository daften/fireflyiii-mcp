export class FireflyError extends Error {
    status;
    url;
    constructor(status, url, body) {
        super(`Firefly III API error ${status} at ${url}: ${body}`);
        this.status = status;
        this.url = url;
        this.name = 'FireflyError';
    }
}
export function formatError(err) {
    if (err instanceof FireflyError) {
        if (err.status === 401)
            return 'Authentication failed. Check your FIREFLY_TOKEN.';
        if (err.status === 404)
            return 'Resource not found.';
        if (err.status === 422)
            return 'Invalid request parameters.';
        if (err.status >= 500)
            return 'Firefly III server error. Try again later.';
        return `API error ${err.status}.`;
    }
    if (err instanceof Error)
        return err.message;
    return 'An unknown error occurred.';
}
export class FireflyClient {
    token;
    baseUrl;
    timeoutMs = 30_000;
    constructor(baseUrl, token) {
        this.token = token;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    async get(path, params) {
        const url = new URL(`${this.baseUrl}/api/v1${path}`);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined)
                    url.searchParams.set(key, String(value));
            }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
            response = await fetch(url.toString(), {
                signal: controller.signal,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Request to ${url} timed out after ${this.timeoutMs}ms.`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new FireflyError(response.status, url.toString(), body);
        }
        return response.json();
    }
}
//# sourceMappingURL=client.js.map