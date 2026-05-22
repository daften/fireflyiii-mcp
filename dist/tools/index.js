import { registerAccountTools } from './accounts.js';
import { registerTransactionTools } from './transactions.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerBillTools } from './bills.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerReportTools } from './reports.js';
import { registerRecurringTools } from './recurring.js';
import { registerRuleTools } from './rules.js';
import { registerAttachmentTools } from './attachments.js';
import { registerCurrencyTools } from './currencies.js';
import { registerExportTools } from './exports.js';
import { registerObjectGroupTools } from './object-groups.js';
import { registerTransactionLinkTools } from './transaction-links.js';
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
];
export const PRESETS = {
    minimal: ['accounts', 'transactions'],
    default: ['accounts', 'transactions', 'budgets', 'categories', 'bills'],
    budgeting: ['accounts', 'transactions', 'budgets', 'categories', 'bills', 'piggy-banks'],
    insights: ['accounts', 'transactions', 'categories', 'reports'],
    automation: ['accounts', 'transactions', 'rules', 'recurring'],
    full: [...TOOL_GROUPS],
};
function isReadOnlyTool(name) {
    return name.startsWith('get_') || name.startsWith('search_') || name.startsWith('test_');
}
function makeReadOnlyProxy(server) {
    return new Proxy(server, {
        get(target, prop) {
            if (prop === 'registerTool') {
                return (name, config, handler) => {
                    if (isReadOnlyTool(name)) {
                        target.registerTool(name, config, handler);
                    }
                };
            }
            return target[prop];
        },
    });
}
export function registerAllTools(server, client, options = {}) {
    const { preset, groups, readOnly = false } = options;
    const activeGroups = preset
        ? new Set(PRESETS[preset])
        : groups
            ? new Set(groups)
            : new Set(TOOL_GROUPS);
    const s = readOnly ? makeReadOnlyProxy(server) : server;
    if (activeGroups.has('accounts'))
        registerAccountTools(s, client);
    if (activeGroups.has('transactions'))
        registerTransactionTools(s, client);
    if (activeGroups.has('budgets'))
        registerBudgetTools(s, client);
    if (activeGroups.has('categories'))
        registerCategoryTools(s, client);
    if (activeGroups.has('bills'))
        registerBillTools(s, client);
    if (activeGroups.has('piggy-banks'))
        registerPiggyBankTools(s, client);
    if (activeGroups.has('reports'))
        registerReportTools(s, client);
    if (activeGroups.has('rules'))
        registerRuleTools(s, client);
    if (activeGroups.has('recurring'))
        registerRecurringTools(s, client);
    if (activeGroups.has('attachments'))
        registerAttachmentTools(s, client);
    if (activeGroups.has('currencies'))
        registerCurrencyTools(s, client);
    if (activeGroups.has('exports'))
        registerExportTools(s, client);
    if (activeGroups.has('object-groups'))
        registerObjectGroupTools(s, client);
    if (activeGroups.has('transaction-links'))
        registerTransactionLinkTools(s, client);
}
//# sourceMappingURL=index.js.map