import { registerAccountTools } from './accounts.js';
import { registerTransactionTools } from './transactions.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerBillTools } from './bills.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerReportTools } from './reports.js';
import { registerRecurringTools } from './recurring.js';
export function registerAllTools(server, client) {
    registerAccountTools(server, client);
    registerTransactionTools(server, client);
    registerBudgetTools(server, client);
    registerCategoryTools(server, client);
    registerBillTools(server, client);
    registerPiggyBankTools(server, client);
    registerReportTools(server, client);
    registerRecurringTools(server, client);
}
//# sourceMappingURL=index.js.map