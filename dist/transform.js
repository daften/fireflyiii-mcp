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
    return response.map(item => ({
        key: item.key,
        value: {
            key: item.value['key'],
            title: item.value['title'],
            monetary_value: item.value['monetary_value'],
            currency_id: item.value['currency_id'],
            currency_code: item.value['currency_code'],
            value_parsed: item.value['value_parsed'],
        },
    }));
}
//# sourceMappingURL=transform.js.map