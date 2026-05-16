import { describe, it, expect } from 'vitest';
import { unwrapList, unwrapSingle, cleanSummary } from '../transform.js';
import type { JsonApiListResponse, JsonApiSingleResponse, RawSummaryItem } from '../transform.js';

const listFixture: JsonApiListResponse = {
  data: [
    {
      id: '240',
      type: 'accounts',
      attributes: { name: 'Checking', current_balance: '1234.56', active: true },
      links: { self: 'https://firefly.example.com/api/v1/accounts/240', '0': { rel: 'self', uri: '/accounts/240' } },
    },
  ],
  meta: {
    pagination: { current_page: 1, total_pages: 52, total: 2580 },
  },
};

const singleFixture: JsonApiSingleResponse = {
  data: {
    id: '240',
    type: 'accounts',
    attributes: { name: 'Checking', current_balance: '1234.56', active: true },
    links: { self: 'https://firefly.example.com/api/v1/accounts/240' },
  },
};

const summaryFixture: RawSummaryItem[] = [
  {
    key: 'balance-in-EUR',
    value: {
      key: 'balance-in-EUR',
      title: 'Balance (€)',
      monetary_value: '8818.16',
      currency_id: '1',
      currency_code: 'EUR',
      currency_symbol: '€',
      currency_decimal_places: 2,
      value_parsed: '€8,818.16',
      local_icon: 'balance-scale',
      sub_title: '-€20,448.98 + €29,267.14',
    },
  },
];

describe('unwrapList', () => {
  it('flattens id and attributes, strips type and links', () => {
    const result = unwrapList(listFixture);
    expect(result.data).toEqual([
      { id: '240', name: 'Checking', current_balance: '1234.56', active: true },
    ]);
  });

  it('extracts compact pagination', () => {
    const result = unwrapList(listFixture);
    expect(result.pagination).toEqual({ page: 1, totalPages: 52, total: 2580 });
  });

  it('sets pagination to undefined when meta is absent', () => {
    const result = unwrapList({ data: [] });
    expect(result.pagination).toBeUndefined();
  });

  it('sets pagination to undefined when meta.pagination is absent', () => {
    const result = unwrapList({ data: [], meta: {} });
    expect(result.pagination).toBeUndefined();
  });
});

describe('unwrapSingle', () => {
  it('merges id with attributes, strips type and links', () => {
    const result = unwrapSingle(singleFixture);
    expect(result).toEqual({ id: '240', name: 'Checking', current_balance: '1234.56', active: true });
  });
});

describe('cleanSummary', () => {
  it('keeps the six useful fields', () => {
    const result = cleanSummary(summaryFixture);
    expect(result).toEqual([
      {
        key: 'balance-in-EUR',
        value: {
          key: 'balance-in-EUR',
          title: 'Balance (€)',
          monetary_value: '8818.16',
          currency_id: '1',
          currency_code: 'EUR',
          value_parsed: '€8,818.16',
        },
      },
    ]);
  });

  it('drops UI-only fields', () => {
    const result = cleanSummary(summaryFixture);
    expect(result[0].value).not.toHaveProperty('local_icon');
    expect(result[0].value).not.toHaveProperty('sub_title');
    expect(result[0].value).not.toHaveProperty('currency_symbol');
    expect(result[0].value).not.toHaveProperty('currency_decimal_places');
  });
});
