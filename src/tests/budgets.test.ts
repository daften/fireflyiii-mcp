import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBudgets, fetchBudgetLimits } from '../tools/budgets.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchBudgets', () => {
  it('calls /budgets with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets', { page: 1, limit: 50 });
  });
});

describe('fetchBudgetLimits', () => {
  it('calls /budgets/:id/limits with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls /budgets/:id/limits without dates when not provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgetLimits(mockClient, '3');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {});
  });
});
