import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchCategories, fetchCategoryTransactions } from '../tools/categories.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchCategories', () => {
  it('calls /categories with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories', { page: 1, limit: 50 });
  });
});

describe('fetchCategoryTransactions', () => {
  it('calls /categories/:id/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategoryTransactions(mockClient, '7', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 2,
      limit: 25,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 2,
      limit: 25,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      page: 1,
      limit: 50,
    });
  });
});
