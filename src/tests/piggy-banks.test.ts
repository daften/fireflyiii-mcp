import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchPiggyBanks, createPiggyBank, updatePiggyBank, deletePiggyBank } from '../tools/piggy-banks.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '2',
      type: 'piggy_banks',
      attributes: { name: 'Holiday Fund', current_amount: '500.00', target_amount: '2000.00' },
      links: { self: 'https://firefly.example.com/api/v1/piggy-banks/2' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchPiggyBanks', () => {
  it('calls /piggy-banks with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/piggy-banks', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({
      name: 'Holiday Fund',
      current_amount: '500.00',
      target_amount: '2000.00',
      id: '2',
    });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

const piggyBankSingleFixture = {
  data: { id: '4', type: 'piggy_banks', attributes: { name: 'Vacation', target_amount: '1000.00', account_id: '1' }, links: {} },
};

describe('createPiggyBank', () => {
  it('posts to /piggy-banks', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    await createPiggyBank(mockClient, { name: 'Vacation', account_id: '1' });
    expect(mockClient.post).toHaveBeenCalledWith('/piggy-banks', { name: 'Vacation', account_id: '1' });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    const result = await createPiggyBank(mockClient, { name: 'Vacation', account_id: '1' });
    expect(result).toEqual({ name: 'Vacation', target_amount: '1000.00', account_id: '1', id: '4' });
  });
});

describe('updatePiggyBank', () => {
  it('puts to /piggy-banks/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    await updatePiggyBank(mockClient, '4', { target_amount: '2000.00' });
    expect(mockClient.put).toHaveBeenCalledWith('/piggy-banks/4', { target_amount: '2000.00' });
  });
});

describe('deletePiggyBank', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deletePiggyBank(mockClient, '4');
    expect(mockClient.delete).toHaveBeenCalledWith('/piggy-banks/4');
    expect(result).toEqual({ deleted: true, id: '4' });
  });
});
