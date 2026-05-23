import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  createCurrency,
  deleteCurrency,
  disableCurrency,
  enableCurrency,
  fetchCurrencies,
  fetchCurrency,
  registerCurrencyTools,
  setPrimaryCurrency,
  updateCurrency,
} from '../tools/currencies.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'currencies',
      attributes: { name: 'Euro', code: 'EUR', symbol: '€', decimal_places: 2, enabled: true, default: true },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const singleFixture = {
  data: {
    id: '1',
    type: 'currencies',
    attributes: { name: 'Euro', code: 'EUR', symbol: '€', decimal_places: 2, enabled: true, default: true },
    links: {},
  },
};

describe('fetchCurrencies', () => {
  it('calls /currencies with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCurrencies(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/currencies', { page: 1, limit: 50 });
  });
  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCurrencies(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({
      name: 'Euro',
      code: 'EUR',
      symbol: '€',
      decimal_places: 2,
      enabled: true,
      default: true,
      id: '1',
    });
  });
});

describe('fetchCurrency', () => {
  it('calls /currencies/:code', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchCurrency(mockClient, 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/currencies/EUR');
  });
});

describe('createCurrency', () => {
  it('posts to /currencies', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createCurrency(mockClient, { name: 'Euro', code: 'EUR', symbol: '€' });
    expect(mockClient.post).toHaveBeenCalledWith('/currencies', expect.objectContaining({ name: 'Euro', code: 'EUR' }));
  });
});

describe('updateCurrency', () => {
  it('puts to /currencies/:code', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateCurrency(mockClient, 'EUR', { symbol: '€€' });
    expect(mockClient.put).toHaveBeenCalledWith('/currencies/EUR', { symbol: '€€' });
  });
});

describe('deleteCurrency', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteCurrency(mockClient, 'EUR');
    expect(mockClient.delete).toHaveBeenCalledWith('/currencies/EUR');
    expect(result).toEqual({ deleted: true, code: 'EUR' });
  });
});

describe('enableCurrency', () => {
  it('posts to /currencies/:code/enable', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await enableCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/enable', {});
  });
});

describe('disableCurrency', () => {
  it('posts to /currencies/:code/disable', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await disableCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/disable', {});
  });
});

describe('setPrimaryCurrency', () => {
  it('posts to /currencies/:code/primary', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await setPrimaryCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/primary', {});
  });
});

describe('handler smoke — currencies', () => {
  it('get_currencies handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerCurrencyTools(server, client);
    const result = await handlers.get('get_currencies')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_currencies handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerCurrencyTools(server, client);
    const result = await handlers.get('get_currencies')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
