import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchRecurrences, fetchRecurrence, createRecurrence, updateRecurrence, deleteRecurrence, fetchRecurrenceTransactions, triggerRecurrence } from '../tools/recurring.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'recurrences',
      attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
      links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '1',
    type: 'recurrences',
    attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
    links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
  },
};

describe('fetchRecurrences', () => {
  it('calls /recurrences with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRecurrences(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchRecurrences(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRecurrence', () => {
  it('calls /recurrences/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchRecurrence(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchRecurrence(mockClient, '1');
    expect(result).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
  });
});

const writeSingleFixture = {
  data: {
    id: '2',
    type: 'recurrences',
    attributes: { title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true },
    links: {},
  },
};

describe('createRecurrence', () => {
  it('posts to /recurrences with correct body structure', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Monthly rent',
      first_date: '2026-06-01',
      repeat_type: 'monthly',
      repeat_moment: '1',
      amount: '950.00',
      transaction_description: 'Rent',
      source_id: '1',
      destination_id: '5',
      weekend: 4,
    });
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences', {
      type: 'withdrawal',
      title: 'Monthly rent',
      first_date: '2026-06-01',
      repeat_until: null,
      apply_rules: true,
      active: true,
      repetitions: [{ type: 'monthly', moment: '1', weekend: 4 }],
      transactions: [{ description: 'Rent', amount: '950.00', source_id: '1', destination_id: '5' }],
    });
  });

  it('includes optional fields when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Rent',
      first_date: '2026-06-01',
      description: 'Monthly rent recurrence',
      notes: 'Pay on time',
      repeat_until: '2027-06-01',
      repeat_type: 'monthly',
      repeat_moment: '1',
      skip: 0,
      amount: '950.00',
      transaction_description: 'Rent',
      source_id: '1',
      destination_id: '5',
      category_id: '12',
      budget_id: '3',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences', expect.objectContaining({
      description: 'Monthly rent recurrence',
      notes: 'Pay on time',
      repeat_until: '2027-06-01',
      repetitions: [expect.objectContaining({ skip: 0 })],
      transactions: [expect.objectContaining({ category_id: '12', budget_id: '3' })],
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Weekly groceries',
      first_date: '2026-06-07',
      repeat_type: 'weekly',
      repeat_moment: '6',
      amount: '80.00',
      transaction_description: 'Groceries',
      source_id: '1',
      destination_id: '2',
    });
    expect(result).toEqual({ title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true, id: '2' });
  });
});

describe('updateRecurrence', () => {
  it('puts to /recurrences/:id with only changed header fields', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { title: 'Updated rent', active: false });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', { title: 'Updated rent', active: false });
  });

  it('includes repetitions array when repeat fields are changed', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { repeat_type: 'weekly', repeat_moment: '5' });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', {
      repetitions: [{ type: 'weekly', moment: '5' }],
    });
  });

  it('includes transactions array when transaction fields are changed', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { amount: '1000.00', transaction_description: 'Updated rent' });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', {
      transactions: [{ amount: '1000.00', description: 'Updated rent' }],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await updateRecurrence(mockClient, '1', { active: false });
    expect(result).toEqual({ title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true, id: '2' });
  });
});

describe('deleteRecurrence', () => {
  it('calls delete on /recurrences/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteRecurrence(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/recurrences/1');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRecurrence(mockClient, '1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

describe('fetchRecurrenceTransactions', () => {
  it('calls /recurrences/:id/transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRecurrenceTransactions(mockClient, '2', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences/2/transactions', { page: 1, limit: 50 });
  });
});

describe('triggerRecurrence', () => {
  it('posts to /recurrences/:id/trigger', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    const result = await triggerRecurrence(mockClient, '2');
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences/2/trigger', {}, {});
    expect(result).toEqual({ triggered: true, id: '2' });
  });
});
