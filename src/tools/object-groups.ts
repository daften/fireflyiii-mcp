import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

export async function fetchObjectGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/object-groups', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchObjectGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/object-groups/${id}`);
  return unwrapSingle(response);
}

export async function createObjectGroup(
  client: FireflyClient,
  params: { title: string; order?: number }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/object-groups', params);
  return unwrapSingle(response);
}

export async function updateObjectGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; order?: number }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/object-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteObjectGroup(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/object-groups/${id}`);
  return { deleted: true, id };
}

export async function fetchObjectGroupBills(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/bills`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchObjectGroupPiggyBanks(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/piggy-banks`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerObjectGroupTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_object_groups', {
    title: 'Get Object Groups',
    description: 'Get all object groups from Firefly III. Object groups organise accounts and piggy banks.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchObjectGroups(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group', {
    title: 'Get Object Group',
    description: 'Get a single object group by ID. Use get_object_groups to find valid IDs.',
    inputSchema: { id: z.string().describe('Object group ID') },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchObjectGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_object_group', {
    title: 'Create Object Group',
    description: 'Create a new object group to organise accounts and piggy banks.',
    inputSchema: {
      title: z.string().describe('Object group title'),
      order: z.number().int().positive().optional().describe('Display order'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createObjectGroup(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_object_group', {
    title: 'Update Object Group',
    description: 'Update an existing object group. Only fields provided will be changed. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      title: z.string().optional().describe('Object group title'),
      order: z.number().int().positive().optional().describe('Display order'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateObjectGroup(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_object_group', {
    title: 'Delete Object Group',
    description: 'Permanently delete an object group. **This action cannot be undone.** Use get_object_groups to confirm the ID before deleting.',
    inputSchema: { id: z.string().describe('Object group ID') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteObjectGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group_bills', {
    title: 'Get Object Group Bills',
    description: 'Get all bills belonging to a specific object group. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, page, limit }) => {
    try {
      const result = await fetchObjectGroupBills(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group_piggy_banks', {
    title: 'Get Object Group Piggy Banks',
    description: 'Get all piggy banks belonging to a specific object group. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, page, limit }) => {
    try {
      const result = await fetchObjectGroupPiggyBanks(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
