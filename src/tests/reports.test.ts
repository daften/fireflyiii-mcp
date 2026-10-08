import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  createTag,
  deleteTag,
  fetchAbout,
  fetchChart,
  fetchExchangeRate,
  fetchInsightExpenses,
  fetchInsightGrouped,
  fetchInsightIncome,
  fetchInsightNoX,
  fetchNetWorth,
  fetchSummary,
  fetchTags,
  fetchTagTransactions,
  registerReportTools,
  updateTag,
} from '../tools/reports.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const tagListFixture = {
  data: [
    {
      id: '9',
      type: 'tags',
      attributes: { tag: 'vacation', date: null },
      links: { self: 'https://firefly.example.com/api/v1/tags/9' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const summaryFixture = {
  'balance-in-EUR': {
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
};

const insightFixture = [
  {
    id: '20',
    name: 'Bank costs',
    difference: '-102.97',
    difference_float: -102.97,
    currency_id: '1',
    currency_code: 'EUR',
  },
];

describe('fetchTags', () => {
  it('calls /tags with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    const result = await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ tag: 'vacation', date: null, id: '9' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchTagTransactions', () => {
  it('calls /tags/:tag/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    await fetchTagTransactions(mockClient, 'vacation', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    const result = await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ tag: 'vacation', date: null, id: '9' });
  });
});

describe('fetchSummary', () => {
  it('calls /summary/basic with required date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('includes currency_code when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31', 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
      currency_code: 'EUR',
    });
  });

  it('returns cleaned summary without UI fields', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    const result = await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(result[0].value).toEqual({
      key: 'balance-in-EUR',
      title: 'Balance (€)',
      monetary_value: '8818.16',
      currency_id: '1',
      currency_code: 'EUR',
      value_parsed: '€8,818.16',
    });
    expect(result[0].value).not.toHaveProperty('local_icon');
  });
});

describe('fetchInsightExpenses', () => {
  it('calls /insight/expense/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    await fetchInsightExpenses(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

describe('fetchInsightIncome', () => {
  it('calls /insight/income/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    await fetchInsightIncome(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/income/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

const tagSingleFixture = {
  data: { id: '6', type: 'tags', attributes: { tag: 'vacation', description: 'holiday expenses' }, links: {} },
};

describe('createTag', () => {
  it('posts to /tags', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    await createTag(mockClient, { tag: 'vacation' });
    expect(mockClient.post).toHaveBeenCalledWith('/tags', { tag: 'vacation' });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    const result = await createTag(mockClient, { tag: 'vacation' });
    expect(result).toEqual({ tag: 'vacation', description: 'holiday expenses', id: '6' });
  });
});

describe('updateTag', () => {
  it('puts to /tags/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    await updateTag(mockClient, '6', { tag: 'holiday' });
    expect(mockClient.put).toHaveBeenCalledWith('/tags/6', { tag: 'holiday' });
  });
});

describe('deleteTag', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTag(mockClient, '6');
    expect(mockClient.delete).toHaveBeenCalledWith('/tags/6');
    expect(result).toEqual({ deleted: true, id: '6' });
  });
});

describe('fetchInsightNoX', () => {
  const endpoints = [
    '/insight/expense/no-bill',
    '/insight/expense/no-budget',
    '/insight/expense/no-category',
    '/insight/expense/no-tag',
    '/insight/income/no-category',
    '/insight/income/no-tag',
    '/insight/transfer/no-category',
    '/insight/transfer/no-tag',
  ];

  for (const endpoint of endpoints) {
    it(`calls ${endpoint} with start and end`, async () => {
      mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
      await fetchInsightNoX(mockClient, endpoint, '2026-01-01', '2026-01-31');
      expect(mockClient.get).toHaveBeenCalledWith(endpoint, {
        start: '2026-01-01',
        end: '2026-01-31',
      });
    });
  }

  it('returns the raw result from the API', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    const result = await fetchInsightNoX(mockClient, '/insight/expense/no-bill', '2026-01-01', '2026-01-31');
    expect(result).toEqual(insightFixture);
  });
});

describe('fetchAbout', () => {
  it('calls /about and returns response', async () => {
    const fixture = { data: { version: '6.1.0', os: 'Linux' } };
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchAbout(mockClient);
    expect(mockClient.get).toHaveBeenCalledWith('/about');
    expect(result).toEqual(fixture);
  });
});

describe('fetchNetWorth', () => {
  // Firefly III v1 has no net-worth endpoint; net worth is the `net-worth-in-*` part of /summary/basic.
  const summaryFixture = {
    'balance-in-EUR': { key: 'balance-in-EUR', title: 'Balance', monetary_value: '10', currency_code: 'EUR' },
    'net-worth-in-EUR': { key: 'net-worth-in-EUR', title: 'Net worth', monetary_value: '5000', currency_code: 'EUR' },
    'net-worth-in-USD': { key: 'net-worth-in-USD', title: 'Net worth', monetary_value: '20', currency_code: 'USD' },
  };

  it('reads /summary/basic and keeps only the net-worth entries', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    const result = await fetchNetWorth(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', { start: '2026-01-01', end: '2026-01-31' });
    expect(result.map((item) => item.key)).toEqual(['net-worth-in-EUR', 'net-worth-in-USD']);
    expect(result[0].value.monetary_value).toBe('5000');
  });

  it('passes currency_code through', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchNetWorth(mockClient, '2026-01-01', '2026-01-31', 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-01-31',
      currency_code: 'EUR',
    });
  });
});

describe('insight tools: account filters', () => {
  // Firefly III's insight endpoints read account filters from `accounts[]` only; anything else is
  // silently ignored and the unfiltered totals come back.
  it.each([
    ['get_insight_expenses_by_asset', 'assets', '/insight/expense/asset'],
    ['get_insight_income_by_asset', 'assets', '/insight/income/asset'],
    ['get_insight_transfers_by_asset', 'assets', '/insight/transfer/asset'],
    ['get_insight_income_by_revenue', 'revenue', '/insight/income/revenue'],
    ['get_insight_expenses_by_expense_account', 'accounts', '/insight/expense/expense'],
  ])('%s sends its %s filter as accounts[]', async (tool, param, endpoint) => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce([]) } as unknown as FireflyClient;
    registerReportTools(server, client);
    await handlers.get(tool)!({ start: '2026-01-01', end: '2026-01-31', [param]: ['4', '9'] });
    expect(client.get).toHaveBeenCalledWith(endpoint, {
      start: '2026-01-01',
      end: '2026-01-31',
      'accounts[]': ['4', '9'],
    });
  });

  it.each([
    ['get_insight_expenses_by_bill', 'bills'],
    ['get_insight_expenses_by_budget', 'budgets'],
    ['get_insight_expenses_by_tag', 'tags'],
    ['get_insight_transfers_by_category', 'categories'],
  ])('%s keeps its own %s[] filter name', async (tool, param) => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce([]) } as unknown as FireflyClient;
    registerReportTools(server, client);
    await handlers.get(tool)!({ start: '2026-01-01', end: '2026-01-31', [param]: ['4'] });
    expect(client.get).toHaveBeenCalledWith(expect.any(String), {
      start: '2026-01-01',
      end: '2026-01-31',
      [`${param}[]`]: ['4'],
    });
  });

  it('sends no filter at all for an empty list', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce([]) } as unknown as FireflyClient;
    registerReportTools(server, client);
    await handlers.get('get_insight_expenses_by_asset')!({ start: '2026-01-01', end: '2026-01-31', assets: [] });
    expect(client.get).toHaveBeenCalledWith('/insight/expense/asset', { start: '2026-01-01', end: '2026-01-31' });
  });
});

describe('fetchChart', () => {
  it('calls chart endpoint with start/end', async () => {
    const fixture = [{ label: 'Checking', entries: {} }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchChart(mockClient, '/chart/account/overview', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/chart/account/overview', { start: '2026-01-01', end: '2026-01-31' });
    expect(result).toEqual(fixture);
  });
});

describe('fetchExchangeRate', () => {
  it('calls exchange rate endpoint', async () => {
    const fixture = { data: { rate: 1.08 } };
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    await fetchExchangeRate(mockClient, 'EUR', 'USD');
    expect(mockClient.get).toHaveBeenCalledWith('/exchange-rates/by-currencies/EUR/USD', {});
  });
  it('includes date when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchExchangeRate(mockClient, 'EUR', 'USD', '2026-01-01');
    expect(mockClient.get).toHaveBeenCalledWith('/exchange-rates/by-currencies/EUR/USD', { date: '2026-01-01' });
  });
});

describe('fetchInsightGrouped', () => {
  it('calls endpoint with start/end', async () => {
    const fixture = [{ name: 'Groceries', difference: '-200' }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchInsightGrouped(mockClient, '/insight/expense/bill', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/bill', { start: '2026-01-01', end: '2026-01-31' });
    expect(result).toEqual(fixture);
  });

  it('passes filter arrays as query params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightGrouped(mockClient, '/insight/expense/bill', '2026-01-01', '2026-01-31', {
      'bills[]': ['1', '2'],
    });
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/bill', {
      start: '2026-01-01',
      end: '2026-01-31',
      'bills[]': ['1', '2'],
    });
  });
});

describe('handler smoke — reports', () => {
  it('get_tags handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(tagListFixture) } as unknown as FireflyClient;
    registerReportTools(server, client);
    const result = await handlers.get('get_tags')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_tags handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerReportTools(server, client);
    const result = await handlers.get('get_tags')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
