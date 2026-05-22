import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { exportEntity } from '../tools/exports.js';

const mockClient = {
  getText: vi.fn(),
} as unknown as FireflyClient;

describe('exportEntity', () => {
  it('calls getText with /data/export/transactions and type=csv', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,date,amount\n1,2026-01-01,50');
    const result = await exportEntity(mockClient, 'transactions', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/transactions', { type: 'csv' });
    expect(result).toBe('id,date,amount\n1,2026-01-01,50');
  });

  it('passes start/end for transactions', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('csv data');
    await exportEntity(mockClient, 'transactions', { start: '2026-01-01', end: '2026-01-31' });
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/transactions', {
      type: 'csv',
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls getText with /data/export/accounts', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Checking');
    await exportEntity(mockClient, 'accounts', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/accounts', { type: 'csv' });
  });

  it('calls getText with /data/export/bills', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Rent');
    await exportEntity(mockClient, 'bills', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/bills', { type: 'csv' });
  });

  it('calls getText with /data/export/budgets', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Groceries');
    await exportEntity(mockClient, 'budgets', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/budgets', { type: 'csv' });
  });

  it('calls getText with /data/export/categories', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Food');
    await exportEntity(mockClient, 'categories', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/categories', { type: 'csv' });
  });

  it('calls getText with /data/export/tags', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,urgent');
    await exportEntity(mockClient, 'tags', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/tags', { type: 'csv' });
  });

  it('calls getText with /data/export/recurring', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Monthly Rent');
    await exportEntity(mockClient, 'recurring', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/recurring', { type: 'csv' });
  });

  it('calls getText with /data/export/rules', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Auto Tag');
    await exportEntity(mockClient, 'rules', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/rules', { type: 'csv' });
  });

  it('calls getText with /data/export/piggy-banks', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Vacation Fund');
    await exportEntity(mockClient, 'piggy-banks', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/piggy-banks', { type: 'csv' });
  });
});
