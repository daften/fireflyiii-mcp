import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
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

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerBudgetTools(server, client);
  registerCategoryTools(server, client);
  registerBillTools(server, client);
  registerPiggyBankTools(server, client);
  registerReportTools(server, client);
  registerRecurringTools(server, client);
  registerRuleTools(server, client);
  registerAttachmentTools(server, client);
}
