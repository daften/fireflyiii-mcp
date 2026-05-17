export interface JsonApiItem {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
    links?: unknown;
}
export interface JsonApiListResponse {
    data: JsonApiItem[];
    meta?: {
        pagination?: {
            current_page: number;
            total_pages: number;
            total: number;
        };
    };
}
export interface JsonApiSingleResponse {
    data: JsonApiItem;
}
export type RawSummaryResponse = Record<string, Record<string, unknown>>;
export interface CleanSummaryItem {
    key: string;
    value: {
        key: string;
        title: string;
        monetary_value: string;
        currency_id: string;
        currency_code: string;
        value_parsed: string;
    };
}
export interface UnwrappedList {
    data: Array<{
        id: string;
    } & Record<string, unknown>>;
    pagination?: {
        page: number;
        totalPages: number;
        total: number;
    };
}
export type UnwrappedSingle = {
    id: string;
} & Record<string, unknown>;
export declare function unwrapList(response: JsonApiListResponse): UnwrappedList;
export declare function unwrapSingle(response: JsonApiSingleResponse): UnwrappedSingle;
export declare function cleanSummary(response: RawSummaryResponse): CleanSummaryItem[];
//# sourceMappingURL=transform.d.ts.map