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

export interface RawSummaryItem {
  key: string;
  value: Record<string, unknown>;
}

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
    data: response.data.map(item => ({ id: item.id, ...item.attributes })),
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
  return { id: response.data.id, ...response.data.attributes };
}

export function cleanSummary(response: RawSummaryItem[]): CleanSummaryItem[] {
  return response.map(item => ({
    key: item.key,
    value: {
      key: item.value['key'] as string,
      title: item.value['title'] as string,
      monetary_value: item.value['monetary_value'] as string,
      currency_id: item.value['currency_id'] as string,
      currency_code: item.value['currency_code'] as string,
      value_parsed: item.value['value_parsed'] as string,
    },
  }));
}
