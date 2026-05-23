import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { registerAccountTools } from './accounts.js';
import { registerAttachmentTools } from './attachments.js';
import { registerBillTools } from './bills.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerCurrencyTools } from './currencies.js';
import { registerExportTools } from './exports.js';
import { registerObjectGroupTools } from './object-groups.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerRecurringTools } from './recurring.js';
import { registerReportTools } from './reports.js';
import { registerRuleTools } from './rules.js';
import { registerTransactionLinkTools } from './transaction-links.js';
import { registerTransactionTools } from './transactions.js';

export const TOOL_GROUPS = [
  'accounts',
  'transactions',
  'budgets',
  'categories',
  'bills',
  'piggy-banks',
  'reports',
  'rules',
  'recurring',
  'attachments',
  'currencies',
  'exports',
  'object-groups',
  'transaction-links',
] as const;

export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const PRESETS: Record<string, ToolGroup[]> = {
  minimal: ['accounts', 'transactions'],
  default: ['accounts', 'transactions', 'budgets', 'categories', 'bills'],
  budgeting: ['accounts', 'transactions', 'budgets', 'categories', 'bills', 'piggy-banks'],
  insights: ['accounts', 'transactions', 'categories', 'reports'],
  automation: ['accounts', 'transactions', 'rules', 'recurring'],
  full: [...TOOL_GROUPS],
};

export type PresetName = keyof typeof PRESETS;

export interface ToolFilterOptions {
  preset?: PresetName;
  groups?: ToolGroup[];
  readOnly?: boolean;
}

function isReadOnlyTool(name: string): boolean {
  return name.startsWith('get_') || name.startsWith('search_') || name.startsWith('test_');
}

export function makeReadOnlyProxy(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        return (name: string, config: unknown, handler: unknown) => {
          if (isReadOnlyTool(name)) {
            (target.registerTool as (n: string, c: unknown, h: unknown) => void)(name, config, handler);
          }
        };
      }
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
    },
  });
}

export function registerAllTools(server: McpServer, client: FireflyClient, options: ToolFilterOptions = {}): void {
  const { preset, groups, readOnly = false } = options;

  const activeGroups: Set<ToolGroup> = preset
    ? new Set(PRESETS[preset])
    : groups
      ? new Set(groups)
      : new Set(TOOL_GROUPS);

  const s = readOnly ? makeReadOnlyProxy(server) : server;

  if (activeGroups.has('accounts')) registerAccountTools(s, client);
  if (activeGroups.has('transactions')) registerTransactionTools(s, client);
  if (activeGroups.has('budgets')) registerBudgetTools(s, client);
  if (activeGroups.has('categories')) registerCategoryTools(s, client);
  if (activeGroups.has('bills')) registerBillTools(s, client);
  if (activeGroups.has('piggy-banks')) registerPiggyBankTools(s, client);
  if (activeGroups.has('reports')) registerReportTools(s, client);
  if (activeGroups.has('rules')) registerRuleTools(s, client);
  if (activeGroups.has('recurring')) registerRecurringTools(s, client);
  if (activeGroups.has('attachments')) registerAttachmentTools(s, client);
  if (activeGroups.has('currencies')) registerCurrencyTools(s, client);
  if (activeGroups.has('exports')) registerExportTools(s, client);
  if (activeGroups.has('object-groups')) registerObjectGroupTools(s, client);
  if (activeGroups.has('transaction-links')) registerTransactionLinkTools(s, client);
}
