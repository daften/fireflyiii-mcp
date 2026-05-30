# Available tools

140 tools across 14 groups. Use [Tool filtering](/reference/filtering) to load only what you need.

## Accounts

| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
| `get_account` | Get a single account by ID with current balance |
| `create_account` | Create a new account |
| `update_account` | Update an existing account |
| `delete_account` | Delete an account. This action cannot be undone. |
| `get_account_transactions` | Get all transactions for a specific account, filterable by type and date range |
| `search_accounts` | Search accounts by name, IBAN, or account number |

## Transactions

| Tool | Description |
|------|-------------|
| `get_transactions` | List transactions with filters (account, date, type) |
| `get_transaction` | Get a single transaction by ID with all splits |
| `search_transactions` | Keyword search across transactions |
| `create_transaction` | Create a new transaction |
| `create_split_transaction` | Create a split transaction (one receipt across multiple categories/budgets) |
| `update_transaction` | Update an existing transaction |
| `bulk_update_transactions` | Update multiple transactions at once using a search query |
| `delete_transaction` | Delete a transaction. This action cannot be undone. |

## Budgets

| Tool | Description |
|------|-------------|
| `get_budgets` | List all budgets with spent/available amounts |
| `get_budget_limits` | Get budget limits for a specific budget and period |
| `create_budget` | Create a new budget |
| `update_budget` | Update an existing budget |
| `delete_budget` | Delete a budget. This action cannot be undone. |
| `create_budget_limit` | Create a budget limit for a specific period |
| `update_budget_limit` | Update an existing budget limit |
| `delete_budget_limit` | Delete a budget limit. This action cannot be undone. |
| `get_available_budgets` | List all available budget periods with amounts available |
| `get_available_budget` | Get a single available budget period by ID |
| `get_budget_transactions` | Get all transactions assigned to a specific budget |
| `get_transactions_without_budget` | Get transactions that have no budget assigned |

## Categories

| Tool | Description |
|------|-------------|
| `get_categories` | List all categories |
| `get_category_transactions` | Get transactions for a specific category |
| `create_category` | Create a new category |
| `update_category` | Update an existing category |
| `delete_category` | Delete a category. This action cannot be undone. |

## Bills

| Tool | Description |
|------|-------------|
| `get_bills` | List all bills with next expected match date |
| `create_bill` | Create a new bill |
| `update_bill` | Update an existing bill |
| `delete_bill` | Delete a bill. This action cannot be undone. |
| `get_bill_transactions` | Get all transactions linked to a specific bill |

## Piggy Banks

| Tool | Description |
|------|-------------|
| `get_piggy_banks` | List all piggy banks with current/target amounts |
| `create_piggy_bank` | Create a new piggy bank |
| `update_piggy_bank` | Update an existing piggy bank |
| `delete_piggy_bank` | Delete a piggy bank. This action cannot be undone. |
| `get_piggy_bank_events` | Get all deposit/withdrawal events for a piggy bank |
| `create_piggy_bank_event` | Add a deposit or withdrawal event to a piggy bank |
| `delete_piggy_bank_event` | Delete a piggy bank event. This action cannot be undone. |

## Recurring Transactions

| Tool | Description |
|------|-------------|
| `get_recurring` | List all recurring transaction rules |
| `get_recurrence` | Get a single recurring transaction rule by ID |
| `create_recurring` | Create a new recurring transaction rule |
| `update_recurring` | Update an existing recurring transaction rule |
| `delete_recurring` | Delete a recurring transaction rule. This action cannot be undone. |
| `get_recurrence_transactions` | Get transactions created by a recurring transaction rule |
| `trigger_recurrence` | Manually fire a recurring rule to create its transaction immediately |

## Automation Rules

| Tool | Description |
|------|-------------|
| `get_rule_groups` | List all rule groups |
| `get_rule_group` | Get a single rule group by ID |
| `create_rule_group` | Create a new rule group |
| `update_rule_group` | Update an existing rule group |
| `delete_rule_group` | Delete a rule group and all its rules. This action cannot be undone. |
| `get_rules` | List all automation rules |
| `get_rule` | Get a single rule by ID |
| `create_rule` | Create a new automation rule with trigger conditions and actions |
| `update_rule` | Update an existing automation rule |
| `delete_rule` | Delete an automation rule. This action cannot be undone. |
| `trigger_rule_group` | Manually run all rules in a group against existing transactions |
| `trigger_rule` | Manually run a single rule against existing transactions |
| `test_rule_group` | Dry-run a rule group and return matching transactions (no changes applied) |
| `test_rule` | Dry-run a single rule and return matching transactions (no changes applied) |
| `get_rule_group_rules` | Get all rules belonging to a specific rule group |

## Attachments

| Tool | Description |
|------|-------------|
| `get_attachments` | List all file attachments |
| `get_attachment` | Get a single attachment by ID |
| `create_attachment` | Create attachment metadata (step 1 of 2 — use `upload_attachment` to send file content) |
| `update_attachment` | Update attachment metadata |
| `delete_attachment` | Delete an attachment and its file data. This action cannot be undone. |
| `upload_attachment` | Upload base64-encoded file content for an existing attachment record (step 2 of 2) |
| `download_attachment` | Download an attachment by ID; images are returned as a rendered image, other files as their filename, MIME type, and Base64 content |

## Tags & Reports

| Tool | Description |
|------|-------------|
| `get_tags` | List all tags |
| `get_tag_transactions` | Get transactions for a specific tag |
| `create_tag` | Create a new tag |
| `update_tag` | Update an existing tag |
| `delete_tag` | Delete a tag. This action cannot be undone. |
| `get_summary` | Basic balance summary (total assets, net worth) |
| `get_insight_expenses` | Expense insights grouped by category for a date range |
| `get_insight_income` | Income insights grouped by category for a date range |
| `get_insight_expenses_no_bill` | Expense totals for transactions with no bill attached |
| `get_insight_expenses_no_budget` | Expense totals for transactions with no budget attached |
| `get_insight_expenses_no_category` | Expense totals for transactions with no category attached |
| `get_insight_expenses_no_tag` | Expense totals for transactions with no tag attached |
| `get_insight_income_no_category` | Income totals for transactions with no category attached |
| `get_insight_income_no_tag` | Income totals for transactions with no tag attached |
| `get_insight_transfer_no_category` | Transfer totals for transactions with no category attached |
| `get_insight_transfer_no_tag` | Transfer totals for transactions with no tag attached |
| `get_about` | Get Firefly III server info (version, PHP version, OS) |
| `get_net_worth_summary` | Get net worth summary for a date range |
| `get_account_overview_chart` | Get account overview chart data for a date range |
| `get_balance_chart` | Get account balance chart data for a date range |
| `get_budget_chart` | Get budget overview chart data for a date range |
| `get_category_chart` | Get category overview chart data for a date range |
| `get_exchange_rate` | Get exchange rate between two currencies |
| `get_insight_expenses_by_bill` | Expense insights grouped by bill for a date range |
| `get_insight_expenses_by_budget` | Expense insights grouped by budget for a date range |
| `get_insight_expenses_by_tag` | Expense insights grouped by tag for a date range |
| `get_insight_expenses_by_asset` | Expense insights grouped by asset account |
| `get_insight_expenses_by_expense_account` | Expense insights grouped by expense account |
| `get_insight_expenses_total` | Total expense amount for a date range |
| `get_insight_income_by_revenue` | Income insights grouped by revenue account |
| `get_insight_income_by_tag` | Income insights grouped by tag |
| `get_insight_income_by_asset` | Income insights grouped by asset account |
| `get_insight_income_total` | Total income amount for a date range |
| `get_insight_transfers_by_category` | Transfer insights grouped by category |
| `get_insight_transfers_by_tag` | Transfer insights grouped by tag |
| `get_insight_transfers_by_asset` | Transfer insights grouped by asset account |
| `get_insight_transfers_total` | Total transfer amount for a date range |

## Currencies

| Tool | Description |
|------|-------------|
| `get_currencies` | List all currencies configured in Firefly III |
| `get_currency` | Get a single currency by code (e.g. EUR, USD) |
| `create_currency` | Create a new currency |
| `update_currency` | Update an existing currency |
| `enable_currency` | Enable a currency for use in transactions |
| `disable_currency` | Disable a currency |
| `set_primary_currency` | Set a currency as the primary/default currency |
| `delete_currency` | Delete a currency. This action cannot be undone. |

## Data Export

| Tool | Description |
|------|-------------|
| `export_transactions` | Export all transactions as CSV (supports date filters) |
| `export_accounts` | Export all accounts as CSV |
| `export_bills` | Export all bills as CSV |
| `export_budgets` | Export all budgets as CSV |
| `export_categories` | Export all categories as CSV |
| `export_tags` | Export all tags as CSV |
| `export_recurring` | Export all recurring transactions as CSV |
| `export_rules` | Export all rules as CSV |
| `export_piggy_banks` | Export all piggy banks as CSV |

## Object Groups

| Tool | Description |
|------|-------------|
| `get_object_groups` | List all object groups (used to organise accounts and piggy banks) |
| `get_object_group` | Get a single object group by ID |
| `create_object_group` | Create a new object group |
| `update_object_group` | Update an existing object group |
| `delete_object_group` | Delete an object group. This action cannot be undone. |
| `get_object_group_bills` | Get all bills in a specific object group |
| `get_object_group_piggy_banks` | Get all piggy banks in a specific object group |

## Transaction Links

| Tool | Description |
|------|-------------|
| `get_link_types` | List available transaction link types (Related, Refund, Paid, etc.) |
| `get_transaction_links` | Get all links attached to a transaction journal entry |
| `get_transaction_link` | Get a single transaction link by ID |
| `create_transaction_link` | Create a link between two transactions |
| `update_transaction_link` | Update an existing transaction link |
| `delete_transaction_link` | Delete a transaction link. This action cannot be undone. |
