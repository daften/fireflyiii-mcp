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

// ---- Attachment fetch + CRUD ----

export async function fetchAttachments(
  client: FireflyClient,
  params: { page?: number; limit?: number },
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
  params: { filename: string; attachable_type: string; attachable_id: string; title?: string; notes?: string },
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/attachments', params);
  return unwrapSingle(response);
}

export async function updateAttachment(
  client: FireflyClient,
  id: string,
  params: { filename?: string; title?: string; notes?: string },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/attachments/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAttachment(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/attachments/${id}`);
  return { deleted: true, id };
}

export async function uploadAttachment(
  client: FireflyClient,
  id: string,
  content: Uint8Array,
): Promise<{ uploaded: true; id: string }> {
  await client.postBinary(`/attachments/${id}/upload`, content);
  return { uploaded: true, id };
}

export async function downloadAttachment(
  client: FireflyClient,
  id: string,
): Promise<{ content_base64: string; contentType: string; filename: string }> {
  const { data, contentType, filename } = await client.getBinary(`/attachments/${id}/download`);
  return {
    content_base64: data.toString('base64'),
    contentType,
    filename,
  };
}

export function registerAttachmentTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_attachments',
    {
      title: 'Get Attachments',
      description: 'Get all file attachments from Firefly III.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) =>
      fetchAttachments(client, { page: page as number | undefined, limit: limit as number | undefined }),
  );

  defineTool(
    server,
    'get_attachment',
    {
      title: 'Get Attachment',
      description: 'Get a single file attachment by its numeric ID. Use get_attachments to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Attachment ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchAttachment(client, id as string),
  );

  defineTool(
    server,
    'create_attachment',
    {
      title: 'Create Attachment',
      description:
        'Create attachment metadata in Firefly III. This creates the metadata record only — use upload_attachment to send the actual file content. The returned ID is needed for the upload step.',
      inputSchema: {
        filename: z.string().describe('Filename including extension, e.g. receipt.pdf'),
        attachable_type: z
          .enum(['Account', 'Budget', 'Bill', 'TransactionJournal', 'PiggyBank', 'Tag'])
          .describe('Type of object this attachment belongs to'),
        attachable_id: z.string().describe('ID of the object this attachment belongs to'),
        title: z.string().optional().describe('Human-readable title'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ filename, attachable_type, attachable_id, title, notes }) =>
      createAttachment(client, {
        filename: filename as string,
        attachable_type: attachable_type as string,
        attachable_id: attachable_id as string,
        title: title as string | undefined,
        notes: notes as string | undefined,
      }),
  );

  defineTool(
    server,
    'update_attachment',
    {
      title: 'Update Attachment',
      description:
        'Update attachment metadata. Only fields provided will be changed. Use get_attachment to confirm the ID before updating.',
      inputSchema: {
        id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
        filename: z.string().optional().describe('Filename including extension'),
        title: z.string().optional().describe('Human-readable title'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, filename, title, notes }) =>
      updateAttachment(client, id as string, {
        filename: filename as string | undefined,
        title: title as string | undefined,
        notes: notes as string | undefined,
      }),
  );

  defineTool(
    server,
    'delete_attachment',
    {
      title: 'Delete Attachment',
      description:
        'Permanently delete an attachment and its file data from Firefly III. **This action cannot be undone.** Use get_attachment to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteAttachment(client, id as string),
  );

  defineTool(
    server,
    'upload_attachment',
    {
      title: 'Upload Attachment File',
      description:
        'Upload the binary content for an existing attachment record. Call create_attachment first to get the attachment ID, then call this tool with the base64-encoded file content. The two-step workflow: (1) create_attachment → get ID, (2) upload_attachment with that ID and content_base64.',
      inputSchema: {
        id: z.string().describe('Attachment ID from create_attachment'),
        content_base64: z.string().describe('File content encoded as base64'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ id, content_base64 }) => uploadAttachment(client, id as string, Buffer.from(content_base64 as string, 'base64')),
  );

  defineTool(
    server,
    'download_attachment',
    {
      title: 'Download Attachment',
      description:
        'Download a file attachment (such as an invoice, PDF, or image receipt) by its ID. Returns the filename, MIME content type, and the file data encoded as a Base64 string. Use get_attachments to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Attachment ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => downloadAttachment(client, id as string),
  );
}
