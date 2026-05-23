import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  createBill,
  deleteBill,
  fetchBills,
  fetchBillTransactions,
  registerBillTools,
  updateBill,
} from '../tools/bills.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '5',
      type: 'bills',
      attributes: { name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/bills/5' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBills', () => {
  it('calls /bills with date range and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true, id: '5' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

const billSingleFixture = {
  data: {
    id: '2',
    type: 'bills',
    attributes: { name: 'Netflix', amount_min: '10.00', amount_max: '15.00', repeat_freq: 'monthly', active: true },
    links: {},
  },
};

describe('createBill', () => {
  it('posts to /bills', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(billSingleFixture);
    await createBill(mockClient, {
      name: 'Netflix',
      amount_min: '10.00',
      amount_max: '15.00',
      date: '2024-01-01',
      repeat_freq: 'monthly',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/bills', expect.objectContaining({ name: 'Netflix' }));
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(billSingleFixture);
    const result = await createBill(mockClient, {
      name: 'Netflix',
      amount_min: '10.00',
      amount_max: '15.00',
      date: '2024-01-01',
      repeat_freq: 'monthly',
    });
    expect(result).toEqual({
      name: 'Netflix',
      amount_min: '10.00',
      amount_max: '15.00',
      repeat_freq: 'monthly',
      active: true,
      id: '2',
    });
  });
});

describe('updateBill', () => {
  it('puts to /bills/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(billSingleFixture);
    await updateBill(mockClient, '2', { name: 'Netflix Premium' });
    expect(mockClient.put).toHaveBeenCalledWith('/bills/2', { name: 'Netflix Premium' });
  });
});

describe('deleteBill', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBill(mockClient, '2');
    expect(mockClient.delete).toHaveBeenCalledWith('/bills/2');
    expect(result).toEqual({ deleted: true, id: '2' });
  });
});

describe('fetchBillTransactions', () => {
  it('calls /bills/:id/transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBillTransactions(mockClient, '5', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills/5/transactions', { page: 1, limit: 50 });
  });
});

describe('handler smoke — bills', () => {
  it('get_bills handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerBillTools(server, client);
    const result = await handlers.get('get_bills')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_bills handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerBillTools(server, client);
    const result = await handlers.get('get_bills')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
