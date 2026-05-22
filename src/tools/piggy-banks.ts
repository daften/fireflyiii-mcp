import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchPiggyBanks(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/piggy-banks', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function createPiggyBank(
  client: FireflyClient,
  params: {
    name: string;
    account_id: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/piggy-banks', params);
  return unwrapSingle(response);
}

export async function updatePiggyBank(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    account_id?: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/piggy-banks/${id}`, params);
  return unwrapSingle(response);
}

export async function deletePiggyBank(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/piggy-banks/${id}`);
  return { deleted: true, id };
}

export async function fetchPiggyBankEvents(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>(`/piggy-banks/${id}/events`, query);
  return unwrapList(response);
}

export async function createPiggyBankEvent(
  client: FireflyClient,
  id: string,
  params: { amount: string; date: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/piggy-banks/${id}/events`, params);
  return unwrapSingle(response);
}

export async function deletePiggyBankEvent(
  client: FireflyClient,
  id: string,
  eventId: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/piggy-banks/${id}/events/${eventId}`);
  return { deleted: true, id: eventId };
}

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerPiggyBankTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_piggy_banks',
    {
      title: 'Get Piggy Banks',
      description: 'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchPiggyBanks(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool('create_piggy_bank', {
    title: 'Create Piggy Bank',
    description: 'Create a new savings goal (piggy bank) in Firefly III. Requires an asset account ID to link to.',
    inputSchema: {
      name: z.string().describe('Piggy bank name'),
      account_id: z.string().describe('Asset account ID to link to — use get_accounts to find valid IDs'),
      target_amount: z.string().optional().describe('Savings goal amount as a number string'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      target_date: z.string().optional().describe('Target completion date (YYYY-MM-DD)'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createPiggyBank(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_piggy_bank', {
    title: 'Update Piggy Bank',
    description: 'Update an existing piggy bank in Firefly III. Only fields provided will be changed. Use get_piggy_banks to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs'),
      name: z.string().optional().describe('Piggy bank name'),
      account_id: z.string().optional().describe('Asset account ID to link to'),
      target_amount: z.string().optional().describe('Savings goal amount as a number string'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      target_date: z.string().optional().describe('Target completion date (YYYY-MM-DD)'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updatePiggyBank(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_piggy_bank', {
    title: 'Delete Piggy Bank',
    description: 'Permanently delete a piggy bank (savings goal) from Firefly III. **This action cannot be undone.** Use get_piggy_banks to confirm the ID before deleting.',
    inputSchema: { id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deletePiggyBank(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool(
    'get_piggy_bank_events',
    {
      title: 'Get Piggy Bank Events',
      description: 'Get all deposit/withdrawal events for a specific piggy bank. Use get_piggy_banks to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Piggy bank ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ id, page, limit }) => {
      try {
        const result = await fetchPiggyBankEvents(client, id, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'create_piggy_bank_event',
    {
      title: 'Create Piggy Bank Event',
      description: 'Add a deposit or withdrawal event to a piggy bank. Use a positive amount for a deposit and a negative amount for a withdrawal.',
      inputSchema: {
        id: z.string().describe('Piggy bank ID'),
        amount: z.string().describe('Amount as a number string. Positive for deposit, negative for withdrawal.'),
        date: z.string().describe('Event date (YYYY-MM-DD)'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, amount, date }) => {
      try {
        const result = await createPiggyBankEvent(client, id, { amount, date });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_piggy_bank_event',
    {
      title: 'Delete Piggy Bank Event',
      description: 'Permanently delete a deposit/withdrawal event from a piggy bank. **This action cannot be undone.** Use get_piggy_bank_events to confirm the event ID.',
      inputSchema: {
        id: z.string().describe('Piggy bank ID'),
        event_id: z.string().describe('Event ID — use get_piggy_bank_events to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id, event_id }) => {
      try {
        const result = await deletePiggyBankEvent(client, id, event_id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
