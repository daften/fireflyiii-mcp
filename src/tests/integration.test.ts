import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FireflyClient } from '../client.js';
import { createAccount, deleteAccount, fetchAccount, fetchAccounts, updateAccount } from '../tools/accounts.js';
import { fetchBudgets } from '../tools/budgets.js';
import { fetchCategories } from '../tools/categories.js';
import { fetchCurrencies } from '../tools/currencies.js';
import { fetchSummary, fetchTags } from '../tools/reports.js';
import { createTransaction, deleteTransaction, fetchTransaction, fetchTransactions } from '../tools/transactions.js';

const SKIP = !process.env.FIREFLY_INTEGRATION;

describe.skipIf(SKIP)('Integration: Firefly III live connection', () => {
  let client: FireflyClient;
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  beforeAll(() => {
    const url = process.env.FIREFLY_URL;
    const token = process.env.FIREFLY_TOKEN;
    if (!url || !token) throw new Error('FIREFLY_URL and FIREFLY_TOKEN must be set');
    client = new FireflyClient(url, token);
  });

  // ── Transform layer ────────────────────────────────────────────────────────
  // These test that fetch functions correctly unwrap JSON:API envelopes.

  describe('fetch functions (transform layer)', () => {
    it('fetchAccounts returns unwrapped list with pagination', async () => {
      const result = await fetchAccounts(client, { limit: 1 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
      if (result.data.length > 0) {
        expect(result.data[0]).toHaveProperty('id');
        expect(result.data[0]).not.toHaveProperty('attributes');
      }
    });

    it('fetchTransactions returns unwrapped list with pagination', async () => {
      const result = await fetchTransactions(client, { limit: 1 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('fetchBudgets returns unwrapped list', async () => {
      const result = await fetchBudgets(client, { limit: 1 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('fetchCategories returns unwrapped list', async () => {
      const result = await fetchCategories(client, { limit: 1 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('fetchCurrencies includes EUR by default', async () => {
      const result = await fetchCurrencies(client, { limit: 100 });
      expect(Array.isArray(result.data)).toBe(true);
      const eur = result.data.find((c: Record<string, unknown>) => c.code === 'EUR');
      expect(eur).toBeDefined();
    });

    it('fetchTags returns unwrapped list', async () => {
      const result = await fetchTags(client, { limit: 1 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('fetchSummary returns cleaned array (no JSON:API envelope)', async () => {
      const result = await fetchSummary(client, yearStart, today);
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('key');
        expect(result[0]).toHaveProperty('value');
        expect(result[0].value).not.toHaveProperty('local_icon');
        expect(result[0].value).not.toHaveProperty('sub_title');
      }
    });
  });

  // ── Account CRUD ───────────────────────────────────────────────────────────

  describe('account CRUD', () => {
    let accountId: string;

    it('can create an expense account', async () => {
      const result = await createAccount(client, {
        name: 'CI Test Expense',
        type: 'expense',
        currency_code: 'EUR',
      });
      expect(result).toHaveProperty('id');
      expect(result.name).toBe('CI Test Expense');
      expect(result).not.toHaveProperty('attributes');
      accountId = result.id as string;
    });

    it('can fetch the created account by ID', async () => {
      const result = await fetchAccount(client, accountId);
      expect(result.id).toBe(accountId);
      expect(result.name).toBe('CI Test Expense');
      expect(result).not.toHaveProperty('attributes');
    });

    it('can delete the account', async () => {
      const result = await deleteAccount(client, accountId);
      expect(result.deleted).toBe(true);
      expect(result.id).toBe(accountId);
    });
  });

  // ── Liability accounts ─────────────────────────────────────────────────────
  // create_account and update_account expose different interest_period enums because Firefly III
  // validates the two endpoints against different lists (see the constants in tools/accounts.ts).
  // That split, and the liability_amount/liability_start_date pairing, are read off Firefly's
  // validators rather than any published schema — these are the only assertions that notice if an
  // upstream release moves them.

  describe('liability accounts', () => {
    let liabilityId: string;

    afterAll(async () => {
      if (liabilityId) await deleteAccount(client, liabilityId).catch(() => {});
    });

    it('can create a liability with its full set of terms', async () => {
      const result = await createAccount(client, {
        name: 'CI Test Mortgage',
        type: 'liability',
        liability_type: 'mortgage',
        liability_direction: 'debit',
        liability_amount: '250000.00',
        liability_start_date: today,
        interest: '3.15',
        interest_period: 'half-year',
        currency_code: 'EUR',
      });
      expect(result).toHaveProperty('id');
      expect(result).not.toHaveProperty('attributes');
      expect(result.liability_type).toBe('mortgage');
      expect(result.liability_direction).toBe('debit');
      expect(Number(result.interest)).toBeCloseTo(3.15);
      expect(result.interest_period).toBe('half-year');
      liabilityId = result.id as string;
    });

    it('rejects a liability start date sent without its amount', async () => {
      await expect(
        createAccount(client, {
          name: 'CI Test Unpaired Liability',
          type: 'liability',
          liability_type: 'debt',
          liability_direction: 'debit',
          liability_start_date: today,
        }),
      ).rejects.toThrow(/liability_amount/);
    });

    it('can update the interest terms with a period the update endpoint accepts', async () => {
      const result = await updateAccount(client, liabilityId, { interest: '4.5', interest_period: 'monthly' });
      expect(Number(result.interest)).toBeCloseTo(4.5);
      expect(result.interest_period).toBe('monthly');
    });

    it('rejects an interest period that only create_account accepts', async () => {
      // 'quarterly' is in create_account's enum but not update_account's. The cast deliberately
      // bypasses that split to confirm Firefly enforces it server-side, which is the whole reason
      // the two tools cannot share one enum.
      const outOfRange = { interest_period: 'quarterly' } as unknown as Parameters<typeof updateAccount>[2];
      await expect(updateAccount(client, liabilityId, outOfRange)).rejects.toThrow(/interest_period/);
    });
  });

  // ── Transaction CRUD ───────────────────────────────────────────────────────

  describe('transaction CRUD', () => {
    let assetAccountId: string;
    let transactionId: string;

    beforeAll(async () => {
      const asset = await createAccount(client, {
        name: 'CI Transaction Test Asset',
        type: 'asset',
        account_role: 'defaultAsset',
        currency_code: 'EUR',
        opening_balance: '1000',
        opening_balance_date: today,
      });
      assetAccountId = asset.id as string;
    });

    afterAll(async () => {
      if (assetAccountId) await deleteAccount(client, assetAccountId).catch(() => {});
    });

    it('can create a withdrawal transaction', async () => {
      const result = await createTransaction(client, {
        type: 'withdrawal',
        date: today,
        amount: '42.00',
        description: 'CI Integration Test Transaction',
        source_id: assetAccountId,
        currency_code: 'EUR',
      });
      expect(result).toHaveProperty('id');
      expect(result).not.toHaveProperty('attributes');
      transactionId = result.id as string;
    });

    it('can fetch the created transaction by ID', async () => {
      const result = await fetchTransaction(client, transactionId);
      expect(result.id).toBe(transactionId);
      expect(result).not.toHaveProperty('attributes');
    });

    it('can delete the transaction', async () => {
      const result = await deleteTransaction(client, transactionId);
      expect(result.deleted).toBe(true);
      expect(result.id).toBe(transactionId);
    });
  });
});
