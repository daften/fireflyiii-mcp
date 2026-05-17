import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchTags,
  fetchTagTransactions,
  fetchSummary,
  fetchInsightExpenses,
  fetchInsightIncome,
  createTag,
  updateTag,
  deleteTag,
} from '../tools/reports.js';

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
  { id: '20', name: 'Bank costs', difference: '-102.97', difference_float: -102.97, currency_id: '1', currency_code: 'EUR' },
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
