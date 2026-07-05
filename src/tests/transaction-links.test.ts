import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  createTransactionLink,
  deleteTransactionLink,
  fetchLinkTypes,
  fetchTransactionLink,
  fetchTransactionLinks,
  registerTransactionLinkTools,
  updateTransactionLink,
} from '../tools/transaction-links.js';
import { createMockServer } from './_helpers.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [{ id: '1', type: 'link_types', attributes: { name: 'Related', editable: true }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const linkSingle = {
  data: {
    id: '5',
    type: 'transaction_links',
    attributes: { link_type_id: '1', inward_id: '10', outward_id: '11', notes: '' },
    links: {},
  },
};

describe('fetchLinkTypes', () => {
  it('calls /link-types with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchLinkTypes(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/link-types', { page: 1, limit: 50 });
  });
});

describe('fetchTransactionLinks', () => {
  it('calls /transaction-journals/:id/links', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactionLinks(mockClient, '10', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/transaction-journals/10/links', { page: 1, limit: 50 });
  });
});

describe('fetchTransactionLink', () => {
  it('calls /transaction-links/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(linkSingle);
    await fetchTransactionLink(mockClient, '5');
    expect(mockClient.get).toHaveBeenCalledWith('/transaction-links/5');
  });
});

describe('createTransactionLink', () => {
  it('posts to /transaction-links', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(linkSingle);
    await createTransactionLink(mockClient, { link_type_id: '1', inward_id: '10', outward_id: '11' });
    expect(mockClient.post).toHaveBeenCalledWith('/transaction-links', {
      link_type_id: '1',
      inward_id: '10',
      outward_id: '11',
    });
  });
});

describe('updateTransactionLink', () => {
  it('puts to /transaction-links/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(linkSingle);
    await updateTransactionLink(mockClient, '5', { notes: 'related purchase' });
    expect(mockClient.put).toHaveBeenCalledWith('/transaction-links/5', { notes: 'related purchase' });
  });
});

describe('deleteTransactionLink', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTransactionLink(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/transaction-links/5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});

describe('handler smoke — transaction-links', () => {
  it('get_link_types handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerTransactionLinkTools(server, client);
    const result = await handlers.get('get_link_types')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_link_types handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerTransactionLinkTools(server, client);
    const result = await handlers.get('get_link_types')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
