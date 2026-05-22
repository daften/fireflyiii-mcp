import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchObjectGroups, fetchObjectGroup, createObjectGroup, updateObjectGroup,
  deleteObjectGroup, fetchObjectGroupBills, fetchObjectGroupPiggyBanks,
} from '../tools/object-groups.js';
import { createMockServer } from './_helpers.js';
import { registerObjectGroupTools } from '../tools/object-groups.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [{ id: '1', type: 'object_groups', attributes: { title: 'Savings', order: 1 }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const singleFixture = {
  data: { id: '1', type: 'object_groups', attributes: { title: 'Savings', order: 1 }, links: {} },
};

describe('fetchObjectGroups', () => {
  it('calls /object-groups with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroups(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups', { page: 1, limit: 50 });
  });
});

describe('fetchObjectGroup', () => {
  it('calls /object-groups/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchObjectGroup(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1');
  });
});

describe('createObjectGroup', () => {
  it('posts to /object-groups', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createObjectGroup(mockClient, { title: 'Savings' });
    expect(mockClient.post).toHaveBeenCalledWith('/object-groups', { title: 'Savings' });
  });
});

describe('updateObjectGroup', () => {
  it('puts to /object-groups/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateObjectGroup(mockClient, '1', { title: 'Long-term Savings' });
    expect(mockClient.put).toHaveBeenCalledWith('/object-groups/1', { title: 'Long-term Savings' });
  });
});

describe('deleteObjectGroup', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteObjectGroup(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/object-groups/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

describe('fetchObjectGroupBills', () => {
  it('calls /object-groups/:id/bills', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroupBills(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1/bills', { page: 1, limit: 50 });
  });
});

describe('fetchObjectGroupPiggyBanks', () => {
  it('calls /object-groups/:id/piggy-banks', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroupPiggyBanks(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1/piggy-banks', { page: 1, limit: 50 });
  });
});

describe('handler smoke — object-groups', () => {
  it('get_object_groups handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(listFixture) } as unknown as FireflyClient;
    registerObjectGroupTools(server, client);
    const result = await handlers.get('get_object_groups')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_object_groups handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerObjectGroupTools(server, client);
    const result = await handlers.get('get_object_groups')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
