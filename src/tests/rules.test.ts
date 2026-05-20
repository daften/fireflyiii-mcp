import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchRuleGroups, fetchRuleGroup, createRuleGroup, updateRuleGroup, deleteRuleGroup,
  fetchRules, fetchRule, createRule, updateRule, deleteRule,
} from '../tools/rules.js';

const mockClient = {
  get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), postBinary: vi.fn(),
} as unknown as FireflyClient;

const ruleGroupListFixture = {
  data: [
    {
      id: '1',
      type: 'rule_groups',
      attributes: { title: 'Default group', active: true, description: null },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const ruleGroupSingleFixture = {
  data: {
    id: '1',
    type: 'rule_groups',
    attributes: { title: 'Default group', active: true, description: null },
    links: {},
  },
};

describe('fetchRuleGroups', () => {
  it('calls /rule-groups with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupListFixture);
    await fetchRuleGroups(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupListFixture);
    const result = await fetchRuleGroups(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRuleGroup', () => {
  it('calls /rule-groups/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await fetchRuleGroup(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    const result = await fetchRuleGroup(mockClient, '1');
    expect(result).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
  });
});

describe('createRuleGroup', () => {
  it('posts to /rule-groups', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await createRuleGroup(mockClient, { title: 'New group', active: true });
    expect(mockClient.post).toHaveBeenCalledWith('/rule-groups', { title: 'New group', active: true });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    const result = await createRuleGroup(mockClient, { title: 'Default group' });
    expect(result).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
  });
});

describe('updateRuleGroup', () => {
  it('puts to /rule-groups/:id with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    await updateRuleGroup(mockClient, '1', { title: 'Renamed group' });
    expect(mockClient.put).toHaveBeenCalledWith('/rule-groups/1', { title: 'Renamed group' });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleGroupSingleFixture);
    const result = await updateRuleGroup(mockClient, '1', { title: 'Renamed group' });
    expect(result).toEqual({ title: 'Default group', active: true, description: null, id: '1' });
  });
});

describe('deleteRuleGroup', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRuleGroup(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/rule-groups/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

const ruleListFixture = {
  data: [
    {
      id: '10',
      type: 'rules',
      attributes: {
        title: 'Tag groceries',
        active: true,
        trigger: 'store-journal',
        strict: true,
        stop_processing: false,
      },
      links: {},
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const ruleSingleFixture = {
  data: {
    id: '10',
    type: 'rules',
    attributes: {
      title: 'Tag groceries',
      active: true,
      trigger: 'store-journal',
      strict: true,
      stop_processing: false,
    },
    links: {},
  },
};

describe('fetchRules', () => {
  it('calls /rules with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleListFixture);
    await fetchRules(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/rules', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleListFixture);
    const result = await fetchRules(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toMatchObject({ title: 'Tag groceries', id: '10' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRule', () => {
  it('calls /rules/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await fetchRule(mockClient, '10');
    expect(mockClient.get).toHaveBeenCalledWith('/rules/10');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    const result = await fetchRule(mockClient, '10');
    expect(result).toMatchObject({ title: 'Tag groceries', id: '10' });
  });
});

describe('createRule', () => {
  it('posts to /rules with required fields including triggers and actions', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await createRule(mockClient, {
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/rules', expect.objectContaining({
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    const result = await createRule(mockClient, {
      title: 'Tag groceries',
      rule_group_id: '1',
      trigger: 'store-journal',
      triggers: [{ type: 'description_contains', value: 'supermarket' }],
      actions: [{ type: 'set_category', value: 'Groceries' }],
    });
    expect(result).toMatchObject({ title: 'Tag groceries', id: '10' });
  });
});

describe('updateRule', () => {
  it('puts to /rules/:id with partial params', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await updateRule(mockClient, '10', { title: 'Updated groceries rule', active: false });
    expect(mockClient.put).toHaveBeenCalledWith('/rules/10', { title: 'Updated groceries rule', active: false });
  });

  it('includes triggers and actions arrays when provided', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(ruleSingleFixture);
    await updateRule(mockClient, '10', {
      triggers: [{ type: 'amount_more', value: '100' }],
      actions: [{ type: 'add_tag', value: 'large-purchase' }],
    });
    expect(mockClient.put).toHaveBeenCalledWith('/rules/10', {
      triggers: [{ type: 'amount_more', value: '100' }],
      actions: [{ type: 'add_tag', value: 'large-purchase' }],
    });
  });
});

describe('deleteRule', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRule(mockClient, '10');
    expect(mockClient.delete).toHaveBeenCalledWith('/rules/10');
    expect(result).toEqual({ deleted: true, id: '10' });
  });
});
