import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { makeReadOnlyProxy, PRESETS, registerAllTools, TOOL_GROUPS } from '../tools/index.js';

function createMockServer() {
  const registered: string[] = [];
  const toolConfigs = new Map<string, unknown>();
  const server = {
    registerTool: vi.fn((name: string, config: unknown) => {
      registered.push(name);
      toolConfigs.set(name, config);
    }),
    registerPrompt: vi.fn(),
  } as unknown as McpServer;
  return { server, registered, toolConfigs };
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
    expect(registered).toContain('get_currencies');
    expect(registered.length).toBe(137);
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
    expect(registered.length).toBe(15);
  });

  it('default preset registers accounts, transactions, budgets, categories, bills (35 tools)', () => {
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
    expect(registered.length).toBe(37);
  });

  it('budgeting preset registers accounts, transactions, budgets, categories, bills, piggy-banks (42 tools)', () => {
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
    expect(registered.length).toBe(42);
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
    expect(registered.length).toBe(57);
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
    expect(registered.length).toBe(37);
  });

  it('full preset registers all 137 tools', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { preset: 'full' });
    expect(registered.length).toBe(137);
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
    expect(registered.length).toBe(12);
  });

  it('single group registers only that group', () => {
    const { server, registered } = createMockServer();
    registerAllTools(server, mockClient, { groups: ['rules'] });
    expect(registered).toContain('get_rule_groups');
    expect(registered).toContain('trigger_rule');
    expect(registered).toContain('test_rule');
    expect(registered).not.toContain('get_accounts');
    expect(registered.length).toBe(15);
  });
});

describe('registerAllTools — readOnly', () => {
  it('filters out all write tools (no options + readOnly)', () => {
    const { server, registered, toolConfigs } = createMockServer();
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
    // Read-only tools that are not named get_/search_/test_ are kept too: the filter follows the
    // readOnlyHint annotation, not the name.
    expect(registered).toContain('export_transactions');
    expect(registered).toContain('download_attachment');
    // Every registered tool must be annotated read-only
    for (const name of registered) {
      expect(
        (toolConfigs.get(name) as { annotations?: { readOnlyHint?: boolean } }).annotations?.readOnlyHint,
        `"${name}" should not be registered in readOnly mode`,
      ).toBe(true);
    }
    expect(registered.length).toBe(84);
  });

  it('tool names and readOnlyHint annotations agree, so the read-only filter stays meaningful', () => {
    const { server, registered, toolConfigs } = createMockServer();
    registerAllTools(server, mockClient);
    const readNamed = (name: string) => /^(get|search|test|export|download)_/.test(name);
    for (const name of registered) {
      const annotations = (toolConfigs.get(name) as { annotations?: { readOnlyHint?: boolean } }).annotations;
      expect(annotations?.readOnlyHint === true, `${name}: name and readOnlyHint disagree`).toBe(readNamed(name));
    }
  });

  it('rejects a preset name inherited from Object.prototype', () => {
    const { server } = createMockServer();
    expect(() => registerAllTools(server, mockClient, { preset: 'toString' as never })).toThrow(
      'Unknown preset "toString"',
    );
  });

  it('rejects an empty group list instead of registering nothing', () => {
    const { server } = createMockServer();
    expect(() => registerAllTools(server, mockClient, { groups: [] })).toThrow('No tool groups selected');
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

describe('makeReadOnlyProxy — this-binding', () => {
  it('non-registerTool methods are bound to the underlying server, not the proxy', () => {
    const inner = {
      value: 42,
      getValue(this: { value: number }) {
        return this.value;
      },
      registerTool: vi.fn(),
    };
    const proxy = makeReadOnlyProxy(inner as unknown as McpServer);
    // Detached on purpose: the proxy must have bound it to the underlying server already.
    const method = (proxy as unknown as { getValue: () => number }).getValue;
    expect(method()).toBe(42);
  });
});

describe('TOOL_GROUPS and PRESETS exports', () => {
  it('TOOL_GROUPS contains all 14 groups', () => {
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
    expect(TOOL_GROUPS).toContain('currencies');
    expect(TOOL_GROUPS).toContain('exports');
    expect(TOOL_GROUPS).toContain('object-groups');
    expect(TOOL_GROUPS).toContain('transaction-links');
    expect(TOOL_GROUPS.length).toBe(14);
  });

  it('PRESETS defines all six preset names', () => {
    expect(Object.keys(PRESETS)).toEqual(
      expect.arrayContaining(['minimal', 'default', 'budgeting', 'insights', 'automation', 'full']),
    );
  });
});
