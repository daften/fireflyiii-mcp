import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle, } from '../transform.js';
// ---- Attachment fetch + CRUD ----
export async function fetchAttachments(client, params) {
    const response = await client.get('/attachments', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchAttachment(client, id) {
    const response = await client.get(`/attachments/${id}`);
    return unwrapSingle(response);
}
export async function createAttachment(client, params) {
    const response = await client.post('/attachments', params);
    return unwrapSingle(response);
}
export async function updateAttachment(client, id, params) {
    const response = await client.put(`/attachments/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteAttachment(client, id) {
    await client.delete(`/attachments/${id}`);
    return { deleted: true, id };
}
export async function uploadAttachment(client, id, content) {
    await client.postBinary(`/attachments/${id}/upload`, content);
    return { uploaded: true, id };
}
export async function downloadAttachment(client, id) {
    return client.getText(`/attachments/${id}/download`);
}
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
export function registerAttachmentTools(server, client) {
    server.registerTool('get_attachments', {
        title: 'Get Attachments',
        description: 'Get all file attachments from Firefly III.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchAttachments(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_attachment', {
        title: 'Get Attachment',
        description: 'Get a single file attachment by its numeric ID. Use get_attachments to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Attachment ID'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await fetchAttachment(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_attachment', {
        title: 'Create Attachment',
        description: 'Create attachment metadata in Firefly III. This creates the metadata record only — use upload_attachment to send the actual file content. The returned ID is needed for the upload step.',
        inputSchema: {
            filename: z.string().describe('Filename including extension, e.g. receipt.pdf'),
            attachable_type: z.enum(['Account', 'Budget', 'Bill', 'TransactionJournal', 'PiggyBank', 'Tag']).describe('Type of object this attachment belongs to'),
            attachable_id: z.string().describe('ID of the object this attachment belongs to'),
            title: z.string().optional().describe('Human-readable title'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async ({ filename, attachable_type, attachable_id, title, notes }) => {
        try {
            const result = await createAttachment(client, { filename, attachable_type, attachable_id, title, notes });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_attachment', {
        title: 'Update Attachment',
        description: 'Update attachment metadata. Only fields provided will be changed. Use get_attachment to confirm the ID before updating.',
        inputSchema: {
            id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
            filename: z.string().optional().describe('Filename including extension'),
            title: z.string().optional().describe('Human-readable title'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, filename, title, notes }) => {
        try {
            const result = await updateAttachment(client, id, { filename, title, notes });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_attachment', {
        title: 'Delete Attachment',
        description: 'Permanently delete an attachment and its file data from Firefly III. **This action cannot be undone.** Use get_attachment to confirm before deleting.',
        inputSchema: {
            id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
        },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteAttachment(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('upload_attachment', {
        title: 'Upload Attachment File',
        description: 'Upload the binary content for an existing attachment record. Call create_attachment first to get the attachment ID, then call this tool with the base64-encoded file content. The two-step workflow: (1) create_attachment → get ID, (2) upload_attachment with that ID and content_base64.',
        inputSchema: {
            id: z.string().describe('Attachment ID from create_attachment'),
            content_base64: z.string().describe('File content encoded as base64'),
        },
        annotations: { openWorldHint: true },
    }, async ({ id, content_base64 }) => {
        try {
            const result = await uploadAttachment(client, id, Buffer.from(content_base64, 'base64'));
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('download_attachment', {
        title: 'Download Attachment',
        description: 'Download the raw content of an attachment as text. Useful for reading receipts or notes. Use get_attachments to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Attachment ID'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const text = await downloadAttachment(client, id);
            return { content: [{ type: 'text', text }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=attachments.js.map