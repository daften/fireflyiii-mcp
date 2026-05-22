import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchCurrencies(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle>;
export declare function createCurrency(client: FireflyClient, params: {
    name: string;
    code: string;
    symbol: string;
    decimal_places?: number;
    enabled?: boolean;
    default?: boolean;
}): Promise<UnwrappedSingle>;
export declare function updateCurrency(client: FireflyClient, code: string, params: {
    name?: string;
    symbol?: string;
    decimal_places?: number;
    enabled?: boolean;
    default?: boolean;
}): Promise<UnwrappedSingle>;
export declare function deleteCurrency(client: FireflyClient, code: string): Promise<{
    deleted: true;
    code: string;
}>;
export declare function enableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle>;
export declare function disableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle>;
export declare function setPrimaryCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle>;
export declare function registerCurrencyTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=currencies.d.ts.map