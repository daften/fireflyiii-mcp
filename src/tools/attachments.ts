import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, ResponseTooLargeError } from '../client.js';
import {
  type JsonApiListResponse,
  type JsonApiSingleResponse,
  type UnwrappedList,
  type UnwrappedSingle,
  unwrapList,
  unwrapSingle,
} from '../transform.js';
import { DELETE_ANNOTATIONS, READ_ANNOTATIONS, UPDATE_ANNOTATIONS, WRITE_ANNOTATIONS } from './_annotations.js';
import { type ContentResult, defineContentTool, defineTool, idSchema } from './_helpers.js';

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

export interface DownloadedAttachment {
  content_base64: string;
  content_type: string;
  filename: string;
}

// download_attachment hands the file to the model: an image as an image block, anything else as
// base64 text, which costs roughly one token per 3 bytes of file. Larger files are refused rather
// than flooding (or overflowing) the context window.
export const MAX_IMAGE_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_FILE_ATTACHMENT_BYTES = 256 * 1024;

const isImage = (contentType: string) => contentType.split(';')[0].trim().toLowerCase().startsWith('image/');
const kib = (bytes: number) => `${Math.round(bytes / 1024)} KiB`;

/**
 * Downloads an attachment, reading its metadata first: Firefly III serves every download as
 * application/octet-stream, so the stored `mime` is the only way to tell an image from a PDF, and the
 * stored `size` lets an oversized file be refused without downloading it at all.
 */
export async function downloadAttachment(client: FireflyClient, id: string): Promise<DownloadedAttachment> {
  const meta = await fetchAttachment(client, id);
  const mime = typeof meta.mime === 'string' && meta.mime !== '' ? meta.mime : undefined;
  const limit = mime && isImage(mime) ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_FILE_ATTACHMENT_BYTES;
  const tooLarge = (size?: number) =>
    new Error(
      `Attachment ${id} is too large to return here${size === undefined ? '' : ` (${kib(size)})`}: the limit is ${kib(MAX_IMAGE_ATTACHMENT_BYTES)} for images and ${kib(MAX_FILE_ATTACHMENT_BYTES)} for other files. Use get_attachment for its details, and open the file in Firefly III.`,
    );
  const declaredSize = Number(meta.size);
  if (Number.isFinite(declaredSize) && declaredSize > limit) throw tooLarge(declaredSize);

  let file: Awaited<ReturnType<FireflyClient['getBinary']>>;
  try {
    // The limit is enforced on the bytes as well, in case the stored size is stale.
    file = await client.getBinary(`/attachments/${id}/download`, undefined, { maxBytes: limit });
  } catch (err) {
    if (!(err instanceof ResponseTooLargeError)) throw err;
    throw tooLarge(err.size);
  }
  return {
    content_base64: file.data.toString('base64'),
    content_type: mime ?? file.contentType,
    filename: typeof meta.filename === 'string' && meta.filename !== '' ? meta.filename : file.filename,
  };
}

/**
 * Map a downloaded attachment to an MCP result. Image attachments are returned
 * as a native `image` content block so clients can render them; everything else
 * is returned as a text block carrying the filename, MIME type, and Base64 data.
 */
export function downloadAttachmentContent(file: DownloadedAttachment): ContentResult {
  const mimeType = file.content_type.split(';')[0].trim();
  if (mimeType.startsWith('image/')) {
    return { content: [{ type: 'image', data: file.content_base64, mimeType }] };
  }
  return {
    content: [
      {
        type: 'text',
        text: `filename: ${file.filename}\ncontent_type: ${file.content_type}\ncontent_base64: ${file.content_base64}`,
      },
    ],
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
    ({ page, limit }) => fetchAttachments(client, { page: page, limit: limit }),
  );

  defineTool(
    server,
    'get_attachment',
    {
      title: 'Get Attachment',
      description: 'Get a single file attachment by its numeric ID. Use get_attachments to find valid IDs.',
      inputSchema: {
        id: idSchema.describe('Attachment ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchAttachment(client, id),
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
        filename: filename,
        attachable_type: attachable_type,
        attachable_id: attachable_id,
        title: title,
        notes: notes,
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
        id: idSchema.describe('Attachment ID — use get_attachments to find valid IDs'),
        filename: z.string().optional().describe('Filename including extension'),
        title: z.string().optional().describe('Human-readable title'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, filename, title, notes }) =>
      updateAttachment(client, id, {
        filename: filename,
        title: title,
        notes: notes,
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
        id: idSchema.describe('Attachment ID — use get_attachments to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteAttachment(client, id),
  );

  defineTool(
    server,
    'upload_attachment',
    {
      title: 'Upload Attachment File',
      description:
        'Upload the binary content for an existing attachment record. Call create_attachment first to get the attachment ID, then call this tool with the base64-encoded file content. The two-step workflow: (1) create_attachment → get ID, (2) upload_attachment with that ID and content_base64.',
      inputSchema: {
        id: idSchema.describe('Attachment ID from create_attachment'),
        content_base64: z.string().describe('File content encoded as base64'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ id, content_base64 }) => uploadAttachment(client, id, Buffer.from(content_base64, 'base64')),
  );

  defineContentTool(
    server,
    'download_attachment',
    {
      title: 'Download Attachment',
      description:
        'Download a file attachment (such as an invoice, PDF, or image receipt) by its ID. Image attachments are returned as a rendered image (up to 3 MiB); other files are returned as their filename, MIME content type, and Base64-encoded content (up to 256 KiB). Larger files are refused. Use get_attachments to find valid IDs.',
      inputSchema: {
        id: idSchema.describe('Attachment ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ id }) => downloadAttachmentContent(await downloadAttachment(client, id)),
  );
}
