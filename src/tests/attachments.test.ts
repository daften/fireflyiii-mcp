import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  createAttachment,
  deleteAttachment,
  downloadAttachment,
  fetchAttachment,
  fetchAttachments,
  registerAttachmentTools,
  updateAttachment,
  uploadAttachment,
} from '../tools/attachments.js';
import { createMockServer } from './_helpers.js';

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  postBinary: vi.fn(),
} as unknown as FireflyClient;

const attachmentListFixture = {
  data: [
    {
      id: '5',
      type: 'attachments',
      attributes: { filename: 'receipt.pdf', title: 'Receipt', notes: null, file_size: 1024 },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const attachmentSingleFixture = {
  data: {
    id: '5',
    type: 'attachments',
    attributes: { filename: 'receipt.pdf', title: 'Receipt', notes: null, file_size: 1024 },
    links: {},
  },
};

describe('fetchAttachments', () => {
  it('calls /attachments with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(attachmentListFixture);
    await fetchAttachments(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/attachments', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(attachmentListFixture);
    const result = await fetchAttachments(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({
      filename: 'receipt.pdf',
      title: 'Receipt',
      notes: null,
      file_size: 1024,
      id: '5',
    });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchAttachment', () => {
  it('calls /attachments/5', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    await fetchAttachment(mockClient, '5');
    expect(mockClient.get).toHaveBeenCalledWith('/attachments/5');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    const result = await fetchAttachment(mockClient, '5');
    expect(result).toEqual({ filename: 'receipt.pdf', title: 'Receipt', notes: null, file_size: 1024, id: '5' });
  });
});

describe('createAttachment', () => {
  it('posts to /attachments with body', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    await createAttachment(mockClient, {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '42',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/attachments', {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '42',
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    const result = await createAttachment(mockClient, {
      filename: 'receipt.pdf',
      attachable_type: 'TransactionJournal',
      attachable_id: '42',
    });
    expect(result).toMatchObject({ filename: 'receipt.pdf', id: '5' });
  });
});

describe('updateAttachment', () => {
  it('puts to /attachments/5 with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    await updateAttachment(mockClient, '5', { title: 'Updated receipt' });
    expect(mockClient.put).toHaveBeenCalledWith('/attachments/5', { title: 'Updated receipt' });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(attachmentSingleFixture);
    const result = await updateAttachment(mockClient, '5', { title: 'Updated receipt' });
    expect(result).toMatchObject({ filename: 'receipt.pdf', id: '5' });
  });
});

describe('deleteAttachment', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteAttachment(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/attachments/5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});

describe('uploadAttachment', () => {
  it('calls postBinary and returns uploaded confirmation', async () => {
    mockClient.postBinary = vi.fn().mockResolvedValueOnce(undefined);
    const content = new Uint8Array([1, 2, 3]);
    const result = await uploadAttachment(mockClient, '5', content);
    expect(result).toEqual({ uploaded: true, id: '5' });
  });

  it('passes the exact Uint8Array to postBinary', async () => {
    mockClient.postBinary = vi.fn().mockResolvedValueOnce(undefined);
    const content = new Uint8Array([1, 2, 3]);
    await uploadAttachment(mockClient, '5', content);
    expect(mockClient.postBinary).toHaveBeenCalledWith('/attachments/5/upload', content);
  });
});

describe('downloadAttachment', () => {
  it('calls getText on /attachments/:id/download', async () => {
    const mockFull = {
      ...mockClient,
      getText: vi.fn().mockResolvedValueOnce('receipt content'),
    } as unknown as FireflyClient;
    const result = await downloadAttachment(mockFull, '7');
    expect(mockFull.getText).toHaveBeenCalledWith('/attachments/7/download');
    expect(result).toBe('receipt content');
  });
});

describe('handler smoke — attachments', () => {
  it('get_attachments handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockResolvedValueOnce(attachmentListFixture) } as unknown as FireflyClient;
    registerAttachmentTools(server, client);
    const result = await handlers.get('get_attachments')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('get_attachments handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerAttachmentTools(server, client);
    const result = await handlers.get('get_attachments')!({});
    expect(result).toMatchObject({ isError: true });
  });
});
