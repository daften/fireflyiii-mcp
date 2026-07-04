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

export async function fetchLinkTypes(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/link-types', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchTransactionLinks(
  client: FireflyClient,
  journalId: string,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/transaction-journals/${journalId}/links`, {
    page: params.page,
    limit: params.limit,
  });
  return unwrapList(response);
}

export async function fetchTransactionLink(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/transaction-links/${id}`);
  return unwrapSingle(response);
}

export async function createTransactionLink(
  client: FireflyClient,
  params: { link_type_id: string; in_id: string; out_id: string; notes?: string },
): Promise<UnwrappedSingle> {
  const { in_id, out_id, ...rest } = params;
  const response = await client.post<JsonApiSingleResponse>('/transaction-links', {
    ...rest,
    inward_id: in_id,
    outward_id: out_id,
  });
  return unwrapSingle(response);
}

export async function updateTransactionLink(
  client: FireflyClient,
  id: string,
  params: { link_type_id?: string; in_id?: string; out_id?: string; notes?: string },
): Promise<UnwrappedSingle> {
  const { in_id, out_id, ...rest } = params;
  const body: Record<string, unknown> = { ...rest };
  if (in_id !== undefined) body.inward_id = in_id;
  if (out_id !== undefined) body.outward_id = out_id;
  const response = await client.put<JsonApiSingleResponse>(`/transaction-links/${id}`, body);
  return unwrapSingle(response);
}

export async function deleteTransactionLink(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/transaction-links/${id}`);
  return { deleted: true, id };
}

export function registerTransactionLinkTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_link_types',
    {
      title: 'Get Link Types',
      description:
        'Get all available transaction link types (e.g. "Related", "Refund", "Paid"). Use these IDs when creating transaction links.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) =>
      fetchLinkTypes(client, { page: page as number | undefined, limit: limit as number | undefined }),
  );

  defineTool(
    server,
    'get_transaction_links',
    {
      title: 'Get Transaction Links',
      description:
        'Get all links attached to a specific transaction journal entry. Use get_transactions to find valid journal IDs.',
      inputSchema: {
        journal_id: z.string().describe('Transaction journal ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ journal_id, page, limit }) =>
      fetchTransactionLinks(client, journal_id as string, {
        page: page as number | undefined,
        limit: limit as number | undefined,
      }),
  );

  defineTool(
    server,
    'get_transaction_link',
    {
      title: 'Get Transaction Link',
      description: 'Get a single transaction link by ID.',
      inputSchema: { id: z.string().describe('Transaction link ID') },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchTransactionLink(client, id as string),
  );

  defineTool(
    server,
    'create_transaction_link',
    {
      title: 'Create Transaction Link',
      description:
        'Create a link between two transactions (e.g. mark one as a refund of another). Use get_link_types to find valid link_type_id values.',
      inputSchema: {
        link_type_id: z.string().describe('Link type ID — use get_link_types to find valid IDs'),
        in_id: z.string().describe('Inward transaction journal ID'),
        out_id: z.string().describe('Outward transaction journal ID'),
        notes: z.string().optional().describe('Notes about this link'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createTransactionLink(client, params as Parameters<typeof createTransactionLink>[1]),
  );

  defineTool(
    server,
    'update_transaction_link',
    {
      title: 'Update Transaction Link',
      description: 'Update an existing transaction link. Only fields provided will be changed.',
      inputSchema: {
        id: z.string().describe('Transaction link ID'),
        link_type_id: z.string().optional().describe('Link type ID'),
        in_id: z.string().optional().describe('Inward transaction journal ID'),
        out_id: z.string().optional().describe('Outward transaction journal ID'),
        notes: z.string().optional().describe('Notes about this link'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) =>
      updateTransactionLink(client, id as string, params as Parameters<typeof updateTransactionLink>[2]),
  );

  defineTool(
    server,
    'delete_transaction_link',
    {
      title: 'Delete Transaction Link',
      description: 'Permanently delete a link between two transactions. **This action cannot be undone.**',
      inputSchema: { id: z.string().describe('Transaction link ID') },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteTransactionLink(client, id as string),
  );
}
