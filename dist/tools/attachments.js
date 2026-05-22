import { z } from 'zod';
import { unwrapList, unwrapSingle, } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';
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
export function registerAttachmentTools(server, client) {
    defineTool(server, 'get_attachments', {
        title: 'Get Attachments',
        description: 'Get all file attachments from Firefly III.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchAttachments(client, { page: page, limit: limit }));
    defineTool(server, 'get_attachment', {
        title: 'Get Attachment',
        description: 'Get a single file attachment by its numeric ID. Use get_attachments to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Attachment ID'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id }) => fetchAttachment(client, id));
    defineTool(server, 'create_attachment', {
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
    }, ({ filename, attachable_type, attachable_id, title, notes }) => createAttachment(client, {
        filename: filename,
        attachable_type: attachable_type,
        attachable_id: attachable_id,
        title: title,
        notes: notes,
    }));
    defineTool(server, 'update_attachment', {
        title: 'Update Attachment',
        description: 'Update attachment metadata. Only fields provided will be changed. Use get_attachment to confirm the ID before updating.',
        inputSchema: {
            id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
            filename: z.string().optional().describe('Filename including extension'),
            title: z.string().optional().describe('Human-readable title'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, filename, title, notes }) => updateAttachment(client, id, {
        filename: filename,
        title: title,
        notes: notes,
    }));
    defineTool(server, 'delete_attachment', {
        title: 'Delete Attachment',
        description: 'Permanently delete an attachment and its file data from Firefly III. **This action cannot be undone.** Use get_attachment to confirm before deleting.',
        inputSchema: {
            id: z.string().describe('Attachment ID — use get_attachments to find valid IDs'),
        },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteAttachment(client, id));
    defineTool(server, 'upload_attachment', {
        title: 'Upload Attachment File',
        description: 'Upload the binary content for an existing attachment record. Call create_attachment first to get the attachment ID, then call this tool with the base64-encoded file content. The two-step workflow: (1) create_attachment → get ID, (2) upload_attachment with that ID and content_base64.',
        inputSchema: {
            id: z.string().describe('Attachment ID from create_attachment'),
            content_base64: z.string().describe('File content encoded as base64'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, ({ id, content_base64 }) => uploadAttachment(client, id, Buffer.from(content_base64, 'base64')));
    defineTool(server, 'download_attachment', {
        title: 'Download Attachment',
        description: 'Download the raw content of an attachment as text. Useful for reading receipts or notes. Use get_attachments to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Attachment ID'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id }) => downloadAttachment(client, id));
}
//# sourceMappingURL=attachments.js.map