import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { registerAllTools, PRESETS, TOOL_GROUPS } from '../tools/index.js';

function createMockServer() {
  const registered: string[] = [];
  const server = {
    registerTool: vi.fn((name: string) => { registered.push(name); }),
  } as unknown as McpServer;
  return { server, registered };
}

const mockClient = {} as FireflyClient;

describe('registerAllTools — no options', () => {
  it('registers all tools across all groups', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient);
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).toContain('get_piggy_banks');
    expect(registered).toContain('get_tags');
    expect(registered).toContain('get_rule_groups');
    expect(registered).toContain('get_recurring');
    expect(registered).toContain('get_attachments');
    expect(registered.length).toBe(97);
  });
});

describe('registerAllTools — presets', () => {
  it('minimal preset registers only accounts and transactions (14 tools)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'minimal' });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).not.toContain('get_budgets');
    expect(registered).not.toContain('get_categories');
    expect(registered).not.toContain('get_bills');
    expect(registered).not.toContain('get_piggy_banks');
    expect(registered).not.toContain('get_tags');
    expect(registered).not.toContain('get_rule_groups');
    expect(registered).not.toContain('get_recurring');
    expect(registered).not.toContain('get_attachments');
    expect(registered.length).toBe(14);
  });

  it('default preset registers accounts, transactions, budgets, categories, bills (31 tools)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'default' });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).toContain('get_budgets');
    expect(registered).toContain('get_categories');
    expect(registered).toContain('get_bills');
    expect(registered).not.toContain('get_piggy_banks');
    expect(registered).not.toContain('get_tags');
    expect(registered).not.toContain('get_rule_groups');
    expect(registered).not.toContain('get_recurring');
    expect(registered).not.toContain('get_attachments');
    expect(registered.length).toBe(31);
  });

  it('budgeting preset registers accounts, transactions, budgets, categories, bills, piggy-banks (35 tools)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'budgeting' });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_budgets');
    expect(registered).toContain('get_piggy_banks');
    expect(registered).not.toContain('get_tags');
    expect(registered).not.toContain('get_rule_groups');
    expect(registered).not.toContain('get_recurring');
    expect(registered).not.toContain('get_attachments');
    expect(registered.length).toBe(35);
  });

  it('insights preset registers accounts, transactions, categories, reports (56 tools)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'insights' });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).toContain('get_categories');
    expect(registered).toContain('get_tags');
    expect(registered).toContain('get_summary');
    expect(registered).not.toContain('get_budgets');
    expect(registered).not.toContain('get_bills');
    expect(registered).not.toContain('get_rule_groups');
    expect(registered).not.toContain('get_recurring');
    expect(registered).not.toContain('get_attachments');
    expect(registered.length).toBe(56);
  });

  it('automation preset registers accounts, transactions, rules, recurring (33 tools)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'automation' });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).toContain('get_rule_groups');
    expect(registered).toContain('get_recurring');
    expect(registered).not.toContain('get_budgets');
    expect(registered).not.toContain('get_piggy_banks');
    expect(registered).not.toContain('get_tags');
    expect(registered).not.toContain('get_attachments');
    expect(registered.length).toBe(33);
  });

  it('full preset registers all 97 tools', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'full' });
    expect(registered.length).toBe(97);
  });
});

describe('registerAllTools — groups', () => {
  it('registers only the specified groups', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { groups: ['accounts', 'piggy-banks'] });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_account_transactions');
    expect(registered).toContain('search_accounts');
    expect(registered).toContain('get_piggy_banks');
    expect(registered).not.toContain('get_transactions');
    expect(registered).not.toContain('get_budgets');
    expect(registered.length).toBe(11);
  });

  it('single group registers only that group', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { groups: ['rules'] });
    expect(registered).toContain('get_rule_groups');
    expect(registered).toContain('trigger_rule');
    expect(registered).toContain('test_rule');
    expect(registered).not.toContain('get_accounts');
    expect(registered.length).toBe(14);
  });
});

describe('registerAllTools — readOnly', () => {
  it('filters out all write tools (no options + readOnly)', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { readOnly: true });
    // Read tools are present
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('search_transactions');
    expect(registered).toContain('test_rule');
    expect(registered).toContain('test_rule_group');
    // Write tools are absent
    expect(registered).not.toContain('create_account');
    expect(registered).not.toContain('update_transaction');
    expect(registered).not.toContain('delete_budget');
    expect(registered).not.toContain('trigger_rule');
    expect(registered).not.toContain('trigger_rule_group');
    expect(registered).not.toContain('upload_attachment');
    // Every registered tool must be a read tool
    for (const name of registered) {
      expect(
        name.startsWith('get_') || name.startsWith('search_') || name.startsWith('test_'),
        `"${name}" should not be registered in readOnly mode`
      ).toBe(true);
    }
  });

  it('readOnly combined with preset filters both groups and tools', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'minimal', readOnly: true });
    expect(registered).toContain('get_accounts');
    expect(registered).toContain('get_transactions');
    expect(registered).toContain('search_transactions');
    expect(registered).not.toContain('create_account');
    expect(registered).not.toContain('create_transaction');
    expect(registered).not.toContain('get_budgets');
  });

  it('readOnly combined with groups filters both groups and tools', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { groups: ['rules'], readOnly: true });
    expect(registered).toContain('get_rule_groups');
    expect(registered).toContain('test_rule');
    expect(registered).not.toContain('create_rule');
    expect(registered).not.toContain('trigger_rule');
  });
});

describe('TOOL_GROUPS and PRESETS exports', () => {
  it('TOOL_GROUPS contains all 10 groups', () => {
    expect(TOOL_GROUPS).toContain('accounts');
    expect(TOOL_GROUPS).toContain('transactions');
    expect(TOOL_GROUPS).toContain('budgets');
    expect(TOOL_GROUPS).toContain('categories');
    expect(TOOL_GROUPS).toContain('bills');
    expect(TOOL_GROUPS).toContain('piggy-banks');
    expect(TOOL_GROUPS).toContain('reports');
    expect(TOOL_GROUPS).toContain('rules');
    expect(TOOL_GROUPS).toContain('recurring');
    expect(TOOL_GROUPS).toContain('attachments');
    expect(TOOL_GROUPS.length).toBe(10);
  });

  it('PRESETS defines all six preset names', () => {
    expect(Object.keys(PRESETS)).toEqual(
      expect.arrayContaining(['minimal', 'default', 'budgeting', 'insights', 'automation', 'full'])
    );
  });
});
