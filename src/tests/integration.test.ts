import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FireflyClient } from '../client.js';
import { createAccount, deleteAccount, fetchAccount, fetchAccounts, updateAccount } from '../tools/accounts.js';
import { createBill, deleteBill } from '../tools/bills.js';
import {
  createBudget,
  createBudgetLimit,
  deleteBudget,
  deleteBudgetLimit,
  fetchBudgetLimits,
  fetchBudgets,
  updateBudgetLimit,
} from '../tools/budgets.js';
import { fetchCategories } from '../tools/categories.js';
import { fetchCurrencies } from '../tools/currencies.js';
import { deleteObjectGroup, fetchObjectGroups } from '../tools/object-groups.js';
import { createPiggyBank, deletePiggyBank, updatePiggyBank } from '../tools/piggy-banks.js';
import { fetchAbout, fetchNetWorth, fetchSummary, fetchTags, registerReportTools } from '../tools/reports.js';
import { createRule, createRuleGroup, deleteRuleGroup } from '../tools/rules.js';
import {
  bulkUpdateTransactions,
  createSplitTransaction,
  createTransaction,
  deleteTransaction,
  fetchTransaction,
  fetchTransactions,
  updateTransaction,
} from '../tools/transactions.js';
import { createMockServer } from './_helpers.js';

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
    let liabilityId: string | undefined;

    // Set by the create test below. The two tests that update this account would otherwise send
    // `PUT /accounts/undefined` when creation failed, burying the one real error under two 404s —
    // and TypeScript can't catch it, because definite-assignment analysis is skipped inside these
    // callbacks. Failing fast here keeps the create test's own message the only one worth reading.
    const requireLiabilityId = (): string => {
      if (!liabilityId) throw new Error('liability account was not created — see the create test above');
      return liabilityId;
    };

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
      const result = await updateAccount(client, requireLiabilityId(), { interest: '4.5', interest_period: 'monthly' });
      expect(Number(result.interest)).toBeCloseTo(4.5);
      expect(result.interest_period).toBe('monthly');
    });

    it('rejects an interest period that only create_account accepts', async () => {
      // 'quarterly' is in create_account's enum but not update_account's. The cast deliberately
      // bypasses that split to confirm Firefly enforces it server-side, which is the whole reason
      // the two tools cannot share one enum.
      const outOfRange = { interest_period: 'quarterly' } as unknown as Parameters<typeof updateAccount>[2];
      await expect(updateAccount(client, requireLiabilityId(), outOfRange)).rejects.toThrow(/interest_period/);
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

  // ── API contract (#117) ────────────────────────────────────────────────────
  // Each test below pins a request shape that the unit tests can only assert against a mock: these
  // are the assertions that notice when the shape and Firefly III disagree.

  describe('API contract (#117)', () => {
    const run = `CI117${Date.now().toString(36)}`;
    const accounts: Record<'checking' | 'savings' | 'shop', string> = { checking: '', savings: '', shop: '' };
    const cleanup: Array<() => Promise<unknown>> = [];

    type Split = { transaction_journal_id: string; description: string; amount: string; notes?: string | null };
    const splitsOf = (group: Record<string, unknown>) => group.transactions as Split[];

    let dbDriver = '';

    beforeAll(async () => {
      dbDriver = ((await fetchAbout(client)) as { data: { driver: string } }).data.driver;
      const asset = async (name: string, opening: string) =>
        (
          await createAccount(client, {
            name: `${run} ${name}`,
            type: 'asset',
            account_role: 'defaultAsset',
            currency_code: 'EUR',
            opening_balance: opening,
            opening_balance_date: yearStart,
          })
        ).id as string;
      accounts.checking = await asset('Checking', '1000');
      accounts.savings = await asset('Savings', '500');
      accounts.shop = (await createAccount(client, { name: `${run} Shop`, type: 'expense', currency_code: 'EUR' }))
        .id as string;
    });

    afterAll(async () => {
      for (const undo of cleanup.reverse()) await undo().catch(() => {});
      // Deleting an account also deletes its transactions.
      for (const id of Object.values(accounts)) if (id) await deleteAccount(client, id).catch(() => {});
    });

    const splitGroup = (title: string, a: string, b: string) =>
      createSplitTransaction(client, {
        type: 'withdrawal',
        date: today,
        source_id: accounts.checking,
        destination_id: accounts.shop,
        currency_code: 'EUR',
        group_title: `${run} ${title}`,
        splits: [
          { amount: '10', description: a },
          { amount: '20', description: b },
        ],
      });

    it('update_transaction changes one split of a split transaction and keeps the other', async () => {
      const group = await splitGroup('update', `${run} split A`, `${run} split B`);
      const before = splitsOf(group);
      const b = before.find((s) => s.description === `${run} split B`)!;

      await expect(updateTransaction(client, group.id, { category_name: `${run} cat` })).rejects.toThrow(
        /has 2 splits; pass transaction_journal_id/,
      );
      await updateTransaction(client, group.id, {
        transaction_journal_id: b.transaction_journal_id,
        amount: '25',
        description: `${run} split B2`,
      });

      const after = splitsOf(await fetchTransaction(client, group.id));
      expect(after.map((s) => s.transaction_journal_id).sort()).toEqual(
        before.map((s) => s.transaction_journal_id).sort(),
      );
      expect(after.find((s) => s.description === `${run} split A`)?.amount).toMatch(/^10(\.0+)?$/);
      expect(after.find((s) => s.transaction_journal_id === b.transaction_journal_id)).toMatchObject({
        description: `${run} split B2`,
      });
      expect(Number(after.find((s) => s.transaction_journal_id === b.transaction_journal_id)?.amount)).toBe(25);
    });

    it('bulk_update_transactions changes only the split the query matches', async () => {
      const group = await splitGroup('bulk', `${run}bulkhit one`, `${run} other two`);
      const result = await bulkUpdateTransactions(client, { query: `${run}bulkhit`, notes: `${run} note` });
      expect(result).toMatchObject({ matched: 1, failed: [] });

      const after = splitsOf(await fetchTransaction(client, group.id));
      expect(after).toHaveLength(2);
      expect(after.find((s) => s.description === `${run}bulkhit one`)?.notes).toBe(`${run} note`);
      expect(after.find((s) => s.description === `${run} other two`)?.notes ?? null).toBeNull();
    });

    it('budget limits are updated and deleted through their budget', async () => {
      const budget = await createBudget(client, { name: `${run} budget` });
      cleanup.push(() => deleteBudget(client, budget.id));
      const month = today.slice(0, 7);
      const limit = await createBudgetLimit(client, budget.id, {
        start: `${month}-01`,
        end: `${month}-28`,
        amount: '100',
        currency_code: 'EUR',
      });

      const updated = await updateBudgetLimit(client, budget.id, limit.id, { amount: '150' });
      expect(Number(updated.amount)).toBe(150);

      await deleteBudgetLimit(client, budget.id, limit.id);
      const remaining = await fetchBudgetLimits(client, budget.id);
      expect(remaining.data.map((l) => l.id)).not.toContain(limit.id);
    });

    let piggyId: string | undefined;

    it('create_piggy_bank sends the multi-account shape', async () => {
      const piggy = await createPiggyBank(client, {
        name: `${run} piggy`,
        accounts: [{ account_id: accounts.checking }, { account_id: accounts.savings }],
        target_amount: '500',
        currency_code: 'EUR',
      });
      piggyId = piggy.id;
      cleanup.push(() => deletePiggyBank(client, piggy.id));
      expect(piggy.accounts as unknown[]).toHaveLength(2);
    });

    it('update_piggy_bank changes one account and keeps the others linked', async (ctx) => {
      // Firefly III 6.7.7 on SQLite (the CI container's database) answers every piggy bank
      // current_amount update with a 500, "bcsub(): Argument #2 ($num2) must be of type string, int
      // given", even for a single-account PUT this server never touches. MySQL and PostgreSQL work.
      if (dbDriver === 'sqlite') ctx.skip();
      if (!piggyId) throw new Error('piggy bank was not created; see the create test above');
      const updated = await updatePiggyBank(client, piggyId, {
        accounts: [{ account_id: accounts.savings, current_amount: '40' }],
      });
      const links = updated.accounts as Array<{ account_id: string; current_amount: string }>;
      expect(links.map((l) => String(l.account_id)).sort()).toEqual([accounts.checking, accounts.savings].sort());
      expect(Number(links.find((l) => String(l.account_id) === accounts.savings)?.current_amount)).toBe(40);
    });

    it('get_net_worth_summary returns the net-worth entries of /summary/basic', async () => {
      const result = await fetchNetWorth(client, yearStart, today);
      expect(result.length).toBeGreaterThan(0);
      for (const item of result) expect(item.key).toMatch(/^net-worth-in-/);
    });

    it('object groups are created by filing a bill under an object_group_title', async () => {
      const title = `${run} group`;
      const bill = await createBill(client, {
        name: `${run} bill`,
        amount_min: '1',
        amount_max: '2',
        date: today,
        repeat_freq: 'monthly',
        currency_code: 'EUR',
        object_group_title: title,
      });
      cleanup.push(() => deleteBill(client, bill.id));
      const groups = await fetchObjectGroups(client, { limit: 100 });
      const group = groups.data.find((g) => g.title === title);
      expect(group).toBeDefined();
      cleanup.push(() => deleteObjectGroup(client, group!.id));
    });

    it('the asset-account filter on insight tools narrows the result', async () => {
      for (const [source, amount] of [
        [accounts.checking, '9'],
        [accounts.savings, '7'],
      ]) {
        await createTransaction(client, {
          type: 'withdrawal',
          date: today,
          amount,
          description: `${run} insight`,
          source_id: source,
          destination_id: accounts.shop,
          currency_code: 'EUR',
        });
      }
      const { server, handlers } = createMockServer();
      registerReportTools(server, client);
      const call = async (args: Record<string, unknown>) => {
        const res = (await handlers.get('get_insight_expenses_by_asset')!({ start: today, end: today, ...args })) as {
          content: Array<{ text: string }>;
        };
        return JSON.parse(res.content[0].text) as Array<{ id: string }>;
      };
      expect((await call({})).map((r) => r.id)).toEqual(expect.arrayContaining([accounts.checking, accounts.savings]));
      expect((await call({ assets: [accounts.savings] })).map((r) => r.id)).toEqual([accounts.savings]);
    });

    it('create_rule accepts the manual-activation trigger', async () => {
      const group = await createRuleGroup(client, { title: `${run} rules` });
      cleanup.push(() => deleteRuleGroup(client, group.id));
      const rule = await createRule(client, {
        title: `${run} manual rule`,
        rule_group_id: group.id,
        trigger: 'manual-activation',
        triggers: [{ type: 'description_contains', value: run }],
        actions: [{ type: 'set_notes', value: 'touched' }],
      });
      expect(rule.trigger).toBe('manual-activation');
    });
  });
});
