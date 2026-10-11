import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { type FireflyClient, FireflyError } from '../client.js';
import {
  bulkUpdateTransactions,
  createSplitTransaction,
  createTransaction,
  deleteTransaction,
  fetchTransaction,
  fetchTransactions,
  registerTransactionTools,
  searchTransactions,
  updateTransaction,
} from '../tools/transactions.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '101',
      type: 'transactions',
      attributes: { description: 'Groceries', amount: '-45.00', date: '2026-01-15' },
      links: { self: 'https://firefly.example.com/api/v1/transactions/101' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 3, total: 120 } },
};

const singleFixture = {
  data: {
    id: '123',
    type: 'transactions',
    attributes: { description: 'Salary', amount: '3000.00', date: '2026-01-01' },
    links: { self: 'https://firefly.example.com/api/v1/transactions/123' },
  },
};

describe('fetchTransactions', () => {
  it('calls /transactions with all provided filters except accountId', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactions(mockClient, {
      type: 'withdrawal',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', {
      type: 'withdrawal',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactions(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchTransactions(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ description: 'Groceries', amount: '-45.00', date: '2026-01-15', id: '101' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });

  // Regression test for #101: /transactions has no account_id filter and silently ignores it,
  // so passing accountId must delegate to /accounts/{id}/transactions instead — the endpoint that
  // actually filters. Two different accountId values against the same window must not collide.
  describe('accountId filtering (#101)', () => {
    it('delegates to /accounts/:id/transactions instead of querying /transactions', async () => {
      mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
      await fetchTransactions(mockClient, {
        accountId: '5',
        type: 'withdrawal',
        start: '2026-01-01',
        end: '2026-01-31',
        page: 1,
        limit: 50,
      });
      expect(mockClient.get).toHaveBeenCalledWith('/accounts/5/transactions', {
        type: 'withdrawal',
        start: '2026-01-01',
        end: '2026-01-31',
        page: 1,
        limit: 50,
      });
    });

    it('produces different requests for different accountId values on the same window', async () => {
      mockClient.get = vi.fn().mockResolvedValue(listFixture);
      await fetchTransactions(mockClient, { accountId: '1', start: '2026-09-01', end: '2026-09-30' });
      await fetchTransactions(mockClient, { accountId: '633', start: '2026-09-01', end: '2026-09-30' });
      const calls = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toBe('/accounts/1/transactions');
      expect(calls[1][0]).toBe('/accounts/633/transactions');
      expect(calls[0][0]).not.toBe(calls[1][0]);
    });

    it('strips a completion-style label suffix from accountId before using it as a path segment', async () => {
      mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
      await fetchTransactions(mockClient, { accountId: '5 (Checking)' });
      expect(mockClient.get).toHaveBeenCalledWith('/accounts/5/transactions', {});
    });
  });
});

describe('fetchTransaction', () => {
  it('calls /transactions/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchTransaction(mockClient, '123');
    expect(mockClient.get).toHaveBeenCalledWith('/transactions/123');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchTransaction(mockClient, '123');
    expect(result).toEqual({ description: 'Salary', amount: '3000.00', date: '2026-01-01', id: '123' });
  });
});

const writeSingleFixture = {
  data: {
    id: '5',
    type: 'transactions',
    attributes: { description: 'Groceries', amount: '42.50', type: 'withdrawal' },
    links: {},
  },
};

describe('createTransaction', () => {
  it('posts to /transactions with wrapped body', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15T09:30:00Z',
      amount: '42.50',
      description: 'Groceries',
      source_id: '1',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [
        expect.objectContaining({
          type: 'withdrawal',
          date: '2024-01-15T09:30:00Z',
          amount: '42.50',
          description: 'Groceries',
          source_id: '1',
        }),
      ],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15',
      amount: '42.50',
      description: 'Groceries',
    });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

/** A JSON:API transaction-group envelope with the given splits. */
function groupFixture(
  id: string,
  splits: Array<[journalId: string, description: string, amount: string]>,
  title: string | null,
) {
  return {
    data: {
      id,
      type: 'transactions',
      attributes: {
        group_title: title,
        transactions: splits.map(([transaction_journal_id, description, amount]) => ({
          transaction_journal_id,
          description,
          amount,
        })),
      },
      links: {},
    },
  };
}

describe('updateTransaction', () => {
  it('updates a single-split transaction through its journal id, without a group title', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(groupFixture('5', [['10', 'Groceries', '42.50']], null));
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateTransaction(mockClient, '5', { date: '2024-01-15T11:30:00+02:00', description: 'Updated' });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions/5');
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/5', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [{ transaction_journal_id: '10', date: '2024-01-15T11:30:00+02:00', description: 'Updated' }],
    });
  });

  it('refuses to guess which split to change on a split transaction', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(
      groupFixture(
        '7',
        [
          ['20', 'split A', '10.00'],
          ['21', 'split B', '20.00'],
        ],
        'Shop',
      ),
    );
    mockClient.put = vi.fn();
    await expect(updateTransaction(mockClient, '7', { category_name: 'Food' })).rejects.toThrow(
      /has 2 splits; pass transaction_journal_id.*20 \("split A", 10\.00\), 21 \("split B", 20\.00\)/,
    );
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it('sends every split with its journal id but changes only the chosen one', async () => {
    // Firefly deletes any existing split the PUT does not mention, and treats an entry without
    // transaction_journal_id as a new split, so both splits must be listed by id.
    mockClient.get = vi.fn().mockResolvedValueOnce(
      groupFixture(
        '7',
        [
          ['20', 'split A', '10.00'],
          ['21', 'split B', '20.00'],
        ],
        'Shop',
      ),
    );
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateTransaction(mockClient, '7', { transaction_journal_id: '21', amount: '25.00', category_name: 'Food' });
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/7', {
      apply_rules: true,
      fire_webhooks: true,
      group_title: 'Shop',
      transactions: [
        { transaction_journal_id: '20' },
        { transaction_journal_id: '21', amount: '25.00', category_name: 'Food' },
      ],
    });
  });

  it('applies a type change to every split, since Firefly requires one type per group', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(
      groupFixture(
        '7',
        [
          ['20', 'split A', '10.00'],
          ['21', 'split B', '20.00'],
        ],
        'Shop',
      ),
    );
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateTransaction(mockClient, '7', { transaction_journal_id: '20', type: 'deposit' });
    const body = vi.mocked(mockClient.put).mock.calls[0][1] as { transactions: Array<Record<string, unknown>> };
    expect(body.transactions).toEqual([
      { transaction_journal_id: '20', type: 'deposit' },
      { transaction_journal_id: '21', type: 'deposit' },
    ]);
  });

  it('falls back to the first split description when a split group has no title', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(
      groupFixture(
        '7',
        [
          ['20', 'split A', '10.00'],
          ['21', 'split B', '20.00'],
        ],
        null,
      ),
    );
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateTransaction(mockClient, '7', { transaction_journal_id: '20', notes: 'n' });
    expect(vi.mocked(mockClient.put).mock.calls[0][1]).toMatchObject({ group_title: 'split A' });
  });

  it('rejects a journal id that is not part of the group', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(groupFixture('5', [['10', 'Groceries', '42.50']], null));
    mockClient.put = vi.fn();
    await expect(updateTransaction(mockClient, '5', { transaction_journal_id: '99', amount: '1' })).rejects.toThrow(
      'Split 99 is not part of transaction group 5',
    );
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it('rejects an update with no fields before calling Firefly', async () => {
    mockClient.get = vi.fn();
    await expect(updateTransaction(mockClient, '5', {})).rejects.toThrow('Nothing to update');
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('returns unwrapped single', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(groupFixture('5', [['10', 'Groceries', '42.50']], null));
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await updateTransaction(mockClient, '5', { amount: '50.00' });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

describe('deleteTransaction', () => {
  it('calls delete on /transactions/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteTransaction(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/transactions/5');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTransaction(mockClient, '5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});

describe('searchTransactions', () => {
  it('calls /search/transactions with query and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchTransactions(mockClient, { query: 'groceries', page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/transactions', {
      query: 'groceries',
      page: 1,
      limit: 20,
    });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await searchTransactions(mockClient, { query: 'groceries' });
    expect(result.data[0]).toEqual({ description: 'Groceries', amount: '-45.00', date: '2026-01-15', id: '101' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });
});

describe('createSplitTransaction', () => {
  it('posts to /transactions with shared fields copied into each split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01T18:45:00-04:00',
      source_id: '1',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries', category_name: 'Food' },
        { amount: '12.50', description: 'Cleaning supplies', category_name: 'Household' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      group_title: 'Supermarket run',
      transactions: [
        {
          type: 'withdrawal',
          date: '2026-05-01T18:45:00-04:00',
          source_id: '1',
          amount: '30.00',
          description: 'Groceries',
          category_name: 'Food',
        },
        {
          type: 'withdrawal',
          date: '2026-05-01T18:45:00-04:00',
          source_id: '1',
          amount: '12.50',
          description: 'Cleaning supplies',
          category_name: 'Household',
        },
      ],
    });
  });

  it('always sends group_title, which Firefly requires for more than one split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/transactions',
      expect.objectContaining({
        group_title: 'Supermarket run',
      }),
    );
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    // amount comes from the mock fixture, not a computed sum
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });

  it('omits undefined shared optional fields from each split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    const body = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.transactions[0]).not.toHaveProperty('source_id');
    expect(body.transactions[0]).not.toHaveProperty('destination_id');
    expect(body.transactions[0]).not.toHaveProperty('currency_code');
  });
});

describe('bulkUpdateTransactions', () => {
  /** A search-results page; each hit lists only the splits that matched, like Firefly's search. */
  function searchPage(hits: Array<[groupId: string, journalIds: string[]]>, page: number, totalPages: number) {
    return {
      data: hits.map(([id, journals]) => ({
        id,
        type: 'transactions',
        attributes: { transactions: journals.map((transaction_journal_id) => ({ transaction_journal_id })) },
      })),
      meta: { pagination: { current_page: page, total_pages: totalPages, total: hits.length } },
    };
  }

  it('rejects a call with nothing to change before searching', async () => {
    mockClient.get = vi.fn();
    await expect(bulkUpdateTransactions(mockClient, { query: 'coffee' })).rejects.toThrow('Nothing to update');
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  it('pages through the search, re-reads each group, and changes only the matched splits', async () => {
    mockClient.get = vi
      .fn()
      .mockResolvedValueOnce(searchPage([['7', ['21']]], 1, 2))
      .mockResolvedValueOnce(searchPage([['8', ['30']]], 2, 2))
      .mockResolvedValueOnce(
        groupFixture(
          '7',
          [
            ['20', 'split A', '10.00'],
            ['21', 'coffee', '3.00'],
          ],
          'Shop',
        ),
      )
      .mockResolvedValueOnce(groupFixture('8', [['30', 'coffee', '2.50']], null));
    mockClient.put = vi.fn().mockResolvedValue(writeSingleFixture);

    const result = await bulkUpdateTransactions(mockClient, { query: 'coffee', category_name: 'Coffee' });

    expect(mockClient.get).toHaveBeenNthCalledWith(1, '/search/transactions', { query: 'coffee', page: 1, limit: 100 });
    expect(mockClient.get).toHaveBeenNthCalledWith(2, '/search/transactions', { query: 'coffee', page: 2, limit: 100 });
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/7', {
      apply_rules: true,
      fire_webhooks: true,
      group_title: 'Shop',
      transactions: [{ transaction_journal_id: '20' }, { transaction_journal_id: '21', category_name: 'Coffee' }],
    });
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/8', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [{ transaction_journal_id: '30', category_name: 'Coffee' }],
    });
    expect(result).toEqual({
      matched: 2,
      updated: [
        { id: '7', splits: ['21'] },
        { id: '8', splits: ['30'] },
      ],
      failed: [],
    });
  });

  it('changes nothing when the query matches more than max_transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(
      searchPage(
        [
          ['1', ['11']],
          ['2', ['12']],
          ['3', ['13']],
        ],
        1,
        1,
      ),
    );
    mockClient.put = vi.fn();
    await expect(
      bulkUpdateTransactions(mockClient, { query: 'coffee', notes: 'x', max_transactions: 2 }),
    ).rejects.toThrow('matches more than 2 transactions, so nothing was changed');
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it('reports per-transaction failures without stopping the rest', async () => {
    mockClient.get = vi
      .fn()
      .mockResolvedValueOnce(
        searchPage(
          [
            ['1', ['11']],
            ['2', ['12']],
          ],
          1,
          1,
        ),
      )
      .mockResolvedValueOnce(groupFixture('1', [['11', 'a', '1']], null))
      .mockResolvedValueOnce(groupFixture('2', [['12', 'b', '2']], null));
    mockClient.put = vi
      .fn()
      .mockRejectedValueOnce(
        new FireflyError(422, 'https://f/api/v1/transactions/1', '{"errors":{"budget_id":["bad"]}}'),
      )
      .mockResolvedValueOnce(writeSingleFixture);
    const result = await bulkUpdateTransactions(mockClient, { query: 'x', budget_id: '3' });
    expect(result.updated).toEqual([{ id: '2', splits: ['12'] }]);
    expect(result.failed).toEqual([{ id: '1', error: expect.stringMatching(/^Validation failed: budget_id\W+bad$/) }]);
  });
});

describe('handler smoke — transactions', () => {
  it('get_transactions handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerTransactionTools(server, client);
    const result = await handlers.get('get_transactions')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_transactions handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerTransactionTools(server, client);
    const result = await handlers.get('get_transactions')!({});
    expect(result).toMatchObject({ isError: true });
  });

  // Regression test for a real mistake: transaction responses carry two different ids — the
  // top-level group `id` (what update/delete expect) and a `transaction_journal_id` nested inside
  // each item of `transactions[]` (usually an adjacent number). Passing the journal id to
  // update_transaction/delete_transaction silently edits or deletes a different transaction. These
  // assertions make sure the warning stays present if the tool descriptions are ever reworded.
  it('warns against transaction_journal_id in id-accepting tool descriptions', () => {
    const { server, toolConfigs } = createMockServer();
    registerTransactionTools(server, {} as unknown as FireflyClient);
    for (const name of ['get_transaction', 'create_transaction', 'update_transaction', 'delete_transaction']) {
      const config = toolConfigs.get(name)!;
      const text =
        name === 'update_transaction' || name === 'delete_transaction'
          ? config.inputSchema.id.description
          : config.description;
      expect(text, `${name} should warn about transaction_journal_id`).toContain('transaction_journal_id');
    }
  });
});

describe('category_name guidance', () => {
  it('warns on every category_name field that Firefly stores the string verbatim', () => {
    const { server, toolConfigs } = createMockServer();
    registerTransactionTools(server, {} as FireflyClient);
    for (const tool of ['create_transaction', 'update_transaction', 'bulk_update_transactions']) {
      expect(toolConfigs.get(tool)!.inputSchema.category_name.description).toContain('&amp;');
    }
    const splits = toolConfigs.get('create_split_transaction')!.inputSchema.splits as z.ZodArray<
      z.ZodObject<Record<string, z.ZodType>>
    >;
    const splitShape = splits.element.shape;
    expect(splitShape.category_name.description).toContain('&amp;');
  });
});
