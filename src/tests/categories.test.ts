import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchCategories, fetchCategoryTransactions, createCategory, updateCategory, deleteCategory } from '../tools/categories.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '7',
      type: 'categories',
      attributes: { name: 'Food & Dining' },
      links: { self: 'https://firefly.example.com/api/v1/categories/7' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchCategories', () => {
  it('calls /categories with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Food & Dining', id: '7' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchCategoryTransactions', () => {
  it('calls /categories/:id/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategoryTransactions(mockClient, '7', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Food & Dining', id: '7' });
  });
});

const categorySingleFixture = {
  data: { id: '8', type: 'categories', attributes: { name: 'Groceries' }, links: {} },
};

describe('createCategory', () => {
  it('posts to /categories', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    await createCategory(mockClient, { name: 'Groceries' });
    expect(mockClient.post).toHaveBeenCalledWith('/categories', { name: 'Groceries' });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    const result = await createCategory(mockClient, { name: 'Groceries' });
    expect(result).toEqual({ name: 'Groceries', id: '8' });
  });
});

describe('updateCategory', () => {
  it('puts to /categories/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    await updateCategory(mockClient, '8', { name: 'Food' });
    expect(mockClient.put).toHaveBeenCalledWith('/categories/8', { name: 'Food' });
  });
});

describe('deleteCategory', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteCategory(mockClient, '8');
    expect(mockClient.delete).toHaveBeenCalledWith('/categories/8');
    expect(result).toEqual({ deleted: true, id: '8' });
  });
});
