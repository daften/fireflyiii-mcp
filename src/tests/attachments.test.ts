import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FireflyClient, FireflyClient as RealFireflyClient } from '../client.js';
import {
  createAttachment,
  deleteAttachment,
  downloadAttachment,
  downloadAttachmentContent,
  fetchAttachment,
  fetchAttachments,
  MAX_FILE_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
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
  const metadata = (attributes: Record<string, unknown>) => ({
    data: { id: '7', type: 'attachments', attributes, links: {} },
  });

  it('reads the metadata first and takes the type and name from it, not from the download', async () => {
    // Firefly III serves every download as application/octet-stream; only the metadata knows the type.
    const mockFull = {
      ...mockClient,
      get: vi.fn().mockResolvedValueOnce(metadata({ filename: 'receipt.pdf', mime: 'application/pdf', size: 15 })),
      getBinary: vi.fn().mockResolvedValueOnce({
        data: Buffer.from('receipt content'),
        contentType: 'application/octet-stream',
        filename: 'download',
      }),
    } as unknown as FireflyClient;
    const result = await downloadAttachment(mockFull, '7');
    expect(mockFull.get).toHaveBeenCalledWith('/attachments/7');
    expect(mockFull.getBinary).toHaveBeenCalledWith('/attachments/7/download', undefined, {
      maxBytes: MAX_FILE_ATTACHMENT_BYTES,
    });
    expect(result).toEqual({
      content_base64: Buffer.from('receipt content').toString('base64'),
      content_type: 'application/pdf',
      filename: 'receipt.pdf',
    });
  });
});

describe('downloadAttachmentContent', () => {
  it('returns a native image block for image attachments', () => {
    const result = downloadAttachmentContent({
      content_base64: 'YWJj',
      content_type: 'image/png',
      filename: 'receipt.png',
    });
    expect(result).toEqual({ content: [{ type: 'image', data: 'YWJj', mimeType: 'image/png' }] });
  });

  it('strips Content-Type parameters when choosing the image MIME type', () => {
    const result = downloadAttachmentContent({
      content_base64: 'YWJj',
      content_type: 'image/jpeg; charset=binary',
      filename: 'photo.jpg',
    });
    expect(result).toEqual({ content: [{ type: 'image', data: 'YWJj', mimeType: 'image/jpeg' }] });
  });

  it('returns a text block with metadata for non-image attachments', () => {
    const result = downloadAttachmentContent({
      content_base64: 'YWJj',
      content_type: 'application/pdf',
      filename: 'receipt.pdf',
    });
    expect(result.content[0]).toMatchObject({ type: 'text' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('filename: receipt.pdf');
    expect(text).toContain('content_type: application/pdf');
    expect(text).toContain('content_base64: YWJj');
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

  it('download_attachment handler returns an image block for image attachments', async () => {
    const { server, handlers } = createMockServer();
    const client = {
      get: vi.fn().mockResolvedValueOnce({
        data: { id: '7', type: 'attachments', attributes: { filename: 'receipt.png', mime: 'image/png', size: 4 } },
      }),
      getBinary: vi.fn().mockResolvedValueOnce({
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: 'application/octet-stream', // what Firefly III actually sends
        filename: 'receipt.png',
      }),
    } as unknown as FireflyClient;
    registerAttachmentTools(server, client);
    const result = await handlers.get('download_attachment')!({ id: '7' });
    expect(result).toMatchObject({ content: [{ type: 'image', mimeType: 'image/png' }] });
  });

  it('download_attachment handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { get: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerAttachmentTools(server, client);
    const result = await handlers.get('download_attachment')!({ id: '7' });
    expect(result).toMatchObject({ isError: true });
  });
});

describe('download size limit', () => {
  /** A fake Firefly III: metadata as JSON, the file as an octet-stream of `bytes` with no Content-Length. */
  function fakeFirefly(meta: Record<string, unknown>, bytes: number) {
    return vi.fn(async (url: string) => {
      if (url.endsWith('/attachments/7')) {
        return Response.json({ data: { id: '7', type: 'attachments', attributes: meta } });
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/octet-stream' } },
      );
    });
  }
  const client = () => new RealFireflyClient('https://firefly.example.com', 'token');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['image/png', MAX_IMAGE_ATTACHMENT_BYTES],
    ['application/pdf', MAX_FILE_ATTACHMENT_BYTES],
  ])('allows a %s up to its limit and refuses one byte more while streaming', async (mime, limit) => {
    vi.stubGlobal('fetch', fakeFirefly({ filename: 'f', mime }, limit));
    await expect(downloadAttachment(client(), '7')).resolves.toMatchObject({ content_type: mime });
    vi.stubGlobal('fetch', fakeFirefly({ filename: 'f', mime }, limit + 1));
    await expect(downloadAttachment(client(), '7')).rejects.toThrow('Attachment 7 is too large to return here');
  });

  it('refuses from the stored size without downloading the file', async () => {
    const fetchSpy = fakeFirefly({ filename: 'scan.pdf', mime: 'application/pdf', size: 10 * 1024 * 1024 }, 1);
    vi.stubGlobal('fetch', fetchSpy);
    await expect(downloadAttachment(client(), '7')).rejects.toThrow('(10240 KiB)');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // the metadata request only
  });
});
