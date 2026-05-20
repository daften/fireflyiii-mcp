import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

// ---- Attachment fetch + CRUD ----

export async function fetchAttachments(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/attachments', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchAttachment(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/attachments/${id}`);
  return unwrapSingle(response);
}

export async function createAttachment(
  client: FireflyClient,
  params: { filename: string; attachable_type: string; attachable_id: string; title?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/attachments', params);
  return unwrapSingle(response);
}

export async function updateAttachment(
  client: FireflyClient,
  id: string,
  params: { filename?: string; title?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/attachments/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAttachment(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/attachments/${id}`);
  return { deleted: true, id };
}

export async function uploadAttachment(
  client: FireflyClient,
  id: string,
  content: Uint8Array
): Promise<{ uploaded: true; id: string }> {
  await client.postBinary(`/attachments/${id}/upload`, content);
  return { uploaded: true, id };
}

export function registerAttachmentTools(_server: McpServer, _client: FireflyClient): void { void z; void formatError; }
