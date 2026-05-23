import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import {
  type JsonApiListResponse,
  type JsonApiSingleResponse,
  type UnwrappedList,
  type UnwrappedSingle,
  unwrapList,
  unwrapSingle,
} from '../transform.js';
import { DELETE_ANNOTATIONS, READ_ANNOTATIONS, UPDATE_ANNOTATIONS, WRITE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';

export async function fetchObjectGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number },
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
  params: { title: string; order?: number },
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/object-groups', params);
  return unwrapSingle(response);
}

export async function updateObjectGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; order?: number },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/object-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteObjectGroup(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/object-groups/${id}`);
  return { deleted: true, id };
}

export async function fetchObjectGroupBills(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/bills`, {
    page: params.page,
    limit: params.limit,
  });
  return unwrapList(response);
}

export async function fetchObjectGroupPiggyBanks(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/piggy-banks`, {
    page: params.page,
    limit: params.limit,
  });
  return unwrapList(response);
}

export function registerObjectGroupTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_object_groups',
    {
      title: 'Get Object Groups',
      description: 'Get all object groups from Firefly III. Object groups organise accounts and piggy banks.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) =>
      fetchObjectGroups(client, { page: page as number | undefined, limit: limit as number | undefined }),
  );

  defineTool(
    server,
    'get_object_group',
    {
      title: 'Get Object Group',
      description: 'Get a single object group by ID. Use get_object_groups to find valid IDs.',
      inputSchema: { id: z.string().describe('Object group ID') },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchObjectGroup(client, id as string),
  );

  defineTool(
    server,
    'create_object_group',
    {
      title: 'Create Object Group',
      description: 'Create a new object group to organise accounts and piggy banks.',
      inputSchema: {
        title: z.string().describe('Object group title'),
        order: z.number().int().positive().optional().describe('Display order'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createObjectGroup(client, params as Parameters<typeof createObjectGroup>[1]),
  );

  defineTool(
    server,
    'update_object_group',
    {
      title: 'Update Object Group',
      description:
        'Update an existing object group. Only fields provided will be changed. Use get_object_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Object group ID'),
        title: z.string().optional().describe('Object group title'),
        order: z.number().int().positive().optional().describe('Display order'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateObjectGroup(client, id as string, params as Parameters<typeof updateObjectGroup>[2]),
  );

  defineTool(
    server,
    'delete_object_group',
    {
      title: 'Delete Object Group',
      description:
        'Permanently delete an object group. **This action cannot be undone.** Use get_object_groups to confirm the ID before deleting.',
      inputSchema: { id: z.string().describe('Object group ID') },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteObjectGroup(client, id as string),
  );

  defineTool(
    server,
    'get_object_group_bills',
    {
      title: 'Get Object Group Bills',
      description: 'Get all bills belonging to a specific object group. Use get_object_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Object group ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, page, limit }) =>
      fetchObjectGroupBills(client, id as string, {
        page: page as number | undefined,
        limit: limit as number | undefined,
      }),
  );

  defineTool(
    server,
    'get_object_group_piggy_banks',
    {
      title: 'Get Object Group Piggy Banks',
      description: 'Get all piggy banks belonging to a specific object group. Use get_object_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Object group ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, page, limit }) =>
      fetchObjectGroupPiggyBanks(client, id as string, {
        page: page as number | undefined,
        limit: limit as number | undefined,
      }),
  );
}
