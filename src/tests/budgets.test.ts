import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBudgets, fetchBudgetLimits, createBudget, updateBudget, deleteBudget, createBudgetLimit, updateBudgetLimit, deleteBudgetLimit } from '../tools/budgets.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '3',
      type: 'budgets',
      attributes: { name: 'Groceries', active: true },
      links: { self: 'https://firefly.example.com/api/v1/budgets/3' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBudgets', () => {
  it('calls /budgets with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Groceries', active: true, id: '3' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchBudgetLimits', () => {
  it('calls /budgets/:id/limits with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls /budgets/:id/limits without dates when not provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {});
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(result.data[0]).toEqual({ name: 'Groceries', active: true, id: '3' });
  });
});

const budgetSingleFixture = {
  data: { id: '3', type: 'budgets', attributes: { name: 'Groceries', active: true }, links: {} },
};
const limitSingleFixture = {
  data: { id: '7', type: 'budget_limits', attributes: { amount: '500.00', start: '2024-01-01', end: '2024-01-31' }, links: {} },
};

describe('createBudget', () => {
  it('posts to /budgets', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    await createBudget(mockClient, { name: 'Groceries' });
    expect(mockClient.post).toHaveBeenCalledWith('/budgets', { name: 'Groceries' });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    const result = await createBudget(mockClient, { name: 'Groceries' });
    expect(result).toEqual({ name: 'Groceries', active: true, id: '3' });
  });
});

describe('updateBudget', () => {
  it('puts to /budgets/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    await updateBudget(mockClient, '3', { name: 'Food' });
    expect(mockClient.put).toHaveBeenCalledWith('/budgets/3', { name: 'Food' });
  });
});

describe('deleteBudget', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBudget(mockClient, '3');
    expect(mockClient.delete).toHaveBeenCalledWith('/budgets/3');
    expect(result).toEqual({ deleted: true, id: '3' });
  });
});

describe('createBudgetLimit', () => {
  it('posts to /budgets/:id/limits', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    await createBudgetLimit(mockClient, '3', { start: '2024-01-01', end: '2024-01-31', amount: '500.00' });
    expect(mockClient.post).toHaveBeenCalledWith('/budgets/3/limits', { start: '2024-01-01', end: '2024-01-31', amount: '500.00' });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    const result = await createBudgetLimit(mockClient, '3', { start: '2024-01-01', end: '2024-01-31', amount: '500.00' });
    expect(result).toEqual({ amount: '500.00', start: '2024-01-01', end: '2024-01-31', id: '7' });
  });
});

describe('updateBudgetLimit', () => {
  it('puts to /budget-limits/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    await updateBudgetLimit(mockClient, '7', { amount: '600.00' });
    expect(mockClient.put).toHaveBeenCalledWith('/budget-limits/7', { amount: '600.00' });
  });
});

describe('deleteBudgetLimit', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBudgetLimit(mockClient, '7');
    expect(mockClient.delete).toHaveBeenCalledWith('/budget-limits/7');
    expect(result).toEqual({ deleted: true, id: '7' });
  });
});
