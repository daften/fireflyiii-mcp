import { describe, it, expect, beforeAll } from 'vitest';
import { FireflyClient } from '../client.js';

const SKIP = !process.env['FIREFLY_INTEGRATION'];

describe.skipIf(SKIP)('Integration: Firefly III live connection', () => {
  let client: FireflyClient;

  beforeAll(() => {
    const url = process.env['FIREFLY_URL'];
    const token = process.env['FIREFLY_TOKEN'];
    if (!url || !token) {
      throw new Error('FIREFLY_URL and FIREFLY_TOKEN must be set for integration tests');
    }
    client = new FireflyClient(url, token);
  });

  it('can authenticate and fetch accounts', async () => {
    const result = await client.get<{ data: unknown[] }>('/accounts', { limit: 1 });
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('can fetch transactions', async () => {
    const result = await client.get<{ data: unknown[] }>('/transactions', { limit: 1 });
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('can fetch summary', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const start = `${today.slice(0, 4)}-01-01`;
    const result = await client.get('/summary/basic', { start, end: today });
    expect(result).toBeDefined();
  });
});
