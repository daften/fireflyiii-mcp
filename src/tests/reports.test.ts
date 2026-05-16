import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchTags,
  fetchTagTransactions,
  fetchSummary,
  fetchInsightExpenses,
  fetchInsightIncome,
} from '../tools/reports.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchTags', () => {
  it('calls /tags with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags', { page: 1, limit: 50 });
  });
});

describe('fetchTagTransactions', () => {
  it('calls /tags/:tag/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
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
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', {
      page: 1,
      limit: 50,
    });
  });
});

describe('fetchSummary', () => {
  it('calls /summary/basic with required date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('includes currency_code when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31', 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
      currency_code: 'EUR',
    });
  });
});

describe('fetchInsightExpenses', () => {
  it('calls /insight/expense/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightExpenses(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

describe('fetchInsightIncome', () => {
  it('calls /insight/income/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightIncome(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/income/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});
