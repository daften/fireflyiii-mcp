# Autocomplete prompts

The server implements standard MCP Prompts with experimental autocomplete (completions) support for common parameters — accounts, budgets, and categories. This lets you select resources via interactive dropdowns instead of guessing numeric database IDs.

::: warning Experimental
Autocomplete is implemented using MCP Prompts, not standard tool arguments. Support depends heavily on your MCP client:

- **Supported:** Claude Code (renders prompt dropdown completions during form-filling)
- **Not supported:** Claude Desktop App (does not render autocomplete dropdowns for MCP Prompts)
:::

## Available prompts

| Prompt | Description |
|--------|-------------|
| `account-transactions` | Transactions for a specific account. Autocompletes account name across all account types. |
| `budget-transactions` | Transactions for a specific budget. Autocompletes budget name. |
| `category-transactions` | Transactions for a specific category. Autocompletes category name. |

## How to use (Claude Code)

1. Click the **`+`** icon in the Claude Code prompt input
2. Select a prompt (e.g. `account-transactions`)
3. Start typing to filter and select from the dropdown

## Performance

Suggestions are pre-fetched (up to 1,000 records) and cached in memory for 60 seconds, returning the top 100 matches per keystroke. The cache is scoped per authenticated user, so it is safe for multi-user HTTP/OAuth deployments.

Set `FIREFLY_DEBUG=true` to log autocomplete cache activity to stderr.
