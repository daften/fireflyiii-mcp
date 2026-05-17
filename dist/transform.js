export function unwrapList(response) {
    return {
        data: response.data.map(item => ({ ...item.attributes, id: item.id })),
        pagination: response.meta?.pagination
            ? {
                page: response.meta.pagination.current_page,
                totalPages: response.meta.pagination.total_pages,
                total: response.meta.pagination.total,
            }
            : undefined,
    };
}
export function unwrapSingle(response) {
    return { ...response.data.attributes, id: response.data.id };
}
export function cleanSummary(response) {
    return Object.entries(response).map(([key, value]) => ({
        key,
        value: {
            key: value['key'],
            title: value['title'],
            monetary_value: value['monetary_value'],
            currency_id: value['currency_id'],
            currency_code: value['currency_code'],
            value_parsed: value['value_parsed'],
        },
    }));
}
//# sourceMappingURL=transform.js.map