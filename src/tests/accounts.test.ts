import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  clearAccountsCache,
  createAccount,
  deleteAccount,
  fetchAccount,
  fetchAccounts,
  fetchAccountTransactions,
  registerAccountTools,
  searchAccounts,
  updateAccount,
} from '../tools/accounts.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'accounts',
      attributes: { name: 'Checking', current_balance: '1000.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/accounts/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '42',
    type: 'accounts',
    attributes: { name: 'Savings', current_balance: '5000.00', active: true },
    links: { self: 'https://firefly.example.com/api/v1/accounts/42' },
  },
};

describe('fetchAccounts', () => {
  it('calls /accounts with type filter when type is not "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'asset', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { type: 'asset', page: 1, limit: 50 });
  });

  it('includes type param when type is "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'all', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { type: 'all', page: 1, limit: 50 });
  });

  it('omits type param when type is undefined', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Checking', current_balance: '1000.00', active: true, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchAccount', () => {
  it('calls /accounts/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchAccount(mockClient, '42');
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/42');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchAccount(mockClient, '42');
    expect(result).toEqual({ name: 'Savings', current_balance: '5000.00', active: true, id: '42' });
  });
});

const accountSingleFixture = {
  data: {
    id: '10',
    type: 'accounts',
    attributes: { name: 'New Account', type: 'asset', active: true },
    links: {},
  },
};

describe('createAccount', () => {
  it('posts to /accounts with params', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    await createAccount(mockClient, { name: 'New Account', type: 'asset', currency_code: 'EUR' });
    expect(mockClient.post).toHaveBeenCalledWith('/accounts', {
      name: 'New Account',
      type: 'asset',
      currency_code: 'EUR',
    });
  });
  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    const result = await createAccount(mockClient, { name: 'New Account', type: 'asset' });
    expect(result).toEqual({ name: 'New Account', type: 'asset', active: true, id: '10' });
  });
});

describe('updateAccount', () => {
  it('puts to /accounts/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    await updateAccount(mockClient, '10', { name: 'Renamed' });
    expect(mockClient.put).toHaveBeenCalledWith('/accounts/10', { name: 'Renamed' });
  });
  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    const result = await updateAccount(mockClient, '10', { name: 'Renamed' });
    expect(result).toEqual({ name: 'New Account', type: 'asset', active: true, id: '10' });
  });
});

describe('deleteAccount', () => {
  it('calls delete on /accounts/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteAccount(mockClient, '10');
    expect(mockClient.delete).toHaveBeenCalledWith('/accounts/10');
  });
  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteAccount(mockClient, '10');
    expect(result).toEqual({ deleted: true, id: '10' });
  });
});

describe('fetchAccountTransactions', () => {
  it('calls /accounts/:id/transactions with params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccountTransactions(mockClient, '1', { start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/1/transactions', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });
  it('omits undefined optional params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccountTransactions(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/1/transactions', { page: 1, limit: 50 });
  });
  it('returns unwrapped list', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchAccountTransactions(mockClient, '1', { page: 1, limit: 50 });
    expect(result.data[0]).toHaveProperty('id');
    expect(result.pagination).toBeDefined();
  });
});

describe('searchAccounts', () => {
  it('calls /search/accounts with query', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchAccounts(mockClient, { query: 'Checking', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/accounts', { query: 'Checking', page: 1, limit: 50 });
  });
  it('includes field when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchAccounts(mockClient, { query: 'NL01ABNA', field: 'iban', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/accounts', {
      query: 'NL01ABNA',
      field: 'iban',
      page: 1,
      limit: 50,
    });
  });
});

describe('handler smoke — accounts', () => {
  it('get_accounts handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerAccountTools(server, client);
    const result = await handlers.get('get_accounts')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_accounts handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerAccountTools(server, client);
    const result = await handlers.get('get_accounts')!({});
    expect(result).toMatchObject({ isError: true });
  });
});

describe('account-transactions prompt', () => {
  it('registers the prompt and resolves account arguments', async () => {
    const { server, prompts } = createMockServer();
    const client = {} as FireflyClient;
    registerAccountTools(server, client);

    const promptHandler = prompts.get('account-transactions');
    expect(promptHandler).toBeDefined();

    const result = await promptHandler!({ account: '1 (Checking - asset)' });
    expect(result).toEqual({
      description: 'Get transactions for account ID 1',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Show me the recent transactions for account ID "1".',
          },
        },
      ],
    });
  });
});

describe('accounts autocomplete completions', () => {
  beforeEach(() => {
    clearAccountsCache();
  });

  it('fetches all accounts with type: "all" and limit: 1000, and filters suggestions case-insensitively', async () => {
    const { server, promptConfigs } = createMockServer();
    const client = {
      get: vi.fn(),
    } as unknown as FireflyClient;

    registerAccountTools(server, client);

    const prompt = promptConfigs.get('account-transactions');
    expect(prompt).toBeDefined();

    const accountField = (prompt as any).argsSchema?.account;
    expect(accountField).toBeDefined();

    const completableSymbol = Symbol.for('mcp.completable');
    const meta = (accountField as any)[completableSymbol];
    expect(meta).toBeDefined();
    expect(typeof meta.complete).toBe('function');

    const multiFixture = {
      data: [
        {
          id: '1',
          type: 'accounts',
          attributes: { name: 'Checking', type: 'asset', active: true },
          links: {},
        },
        {
          id: '2',
          type: 'accounts',
          attributes: { name: 'Dieter', type: 'expense', active: true },
          links: {},
        },
        {
          id: '3',
          type: 'accounts',
          attributes: { name: 'Salary', type: 'revenue', active: true },
          links: {},
        },
      ],
      meta: { pagination: { current_page: 1, total_pages: 1, total: 3 } },
    };

    vi.mocked(client.get).mockResolvedValueOnce(multiFixture);

    // Completion with 'Dieter' should find the expense account
    const results = await meta.complete('Dieter');
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/accounts', { type: 'all', limit: 1000 });

    expect(results).toEqual(['2 (Dieter - expense)']);
  });

  it('throws error (evicting cache) if endpoint fetch fails', async () => {
    const { server, promptConfigs } = createMockServer();
    const client = {
      get: vi.fn(),
    } as unknown as FireflyClient;

    registerAccountTools(server, client);

    const prompt = promptConfigs.get('account-transactions');
    const accountField = (prompt as any).argsSchema?.account;
    const completableSymbol = Symbol.for('mcp.completable');
    const meta = (accountField as any)[completableSymbol];

    vi.mocked(client.get).mockRejectedValueOnce(new Error('Connection error'));

    const results = await meta.complete('');
    expect(results).toEqual([]);
  });
});
