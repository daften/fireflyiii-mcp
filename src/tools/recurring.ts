import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchRecurrences(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/recurrences', query);
  return unwrapList(response);
}

export async function fetchRecurrence(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/recurrences/${id}`);
  return unwrapSingle(response);
}

export function registerRecurringTools(_server: McpServer, _client: FireflyClient): void {
  // tool registrations added in Task 5
}
