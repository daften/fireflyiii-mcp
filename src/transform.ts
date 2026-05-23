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
  data: Array<{ id: string } & Record<string, unknown>>;
  pagination?: { page: number; totalPages: number; total: number };
}

export type UnwrappedSingle = { id: string } & Record<string, unknown>;

export function unwrapList(response: JsonApiListResponse): UnwrappedList {
  return {
    data: response.data.map((item) => ({ ...item.attributes, id: item.id })),
    pagination: response.meta?.pagination
      ? {
          page: response.meta.pagination.current_page,
          totalPages: response.meta.pagination.total_pages,
          total: response.meta.pagination.total,
        }
      : undefined,
  };
}

export function unwrapSingle(response: JsonApiSingleResponse): UnwrappedSingle {
  return { ...response.data.attributes, id: response.data.id };
}

export function cleanSummary(response: RawSummaryResponse): CleanSummaryItem[] {
  return Object.entries(response).map(([key, value]) => ({
    key,
    value: {
      key: value.key as string,
      title: value.title as string,
      monetary_value: value.monetary_value as string,
      currency_id: value.currency_id as string,
      currency_code: value.currency_code as string,
      value_parsed: value.value_parsed as string,
    },
  }));
}
