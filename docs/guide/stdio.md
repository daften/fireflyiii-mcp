# npm + stdio (simplest)

**Requires:** Node.js 20+, a Firefly III Personal Access Token.

Get a PAT from Firefly III: **Options → Remote access and tokens → Create new token**.

## Step 1: Add to your MCP client config

For **Claude Code** (`.claude/mcp.json`) or **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "npx",
      "args": ["-y", "@daften/fireflyiii-mcp"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

Your AI assistant downloads and starts the server automatically on first use. No separate install step is needed.

## Optional: limit which tools are loaded

With 140 tools, loading everything uses significant context window space. Use `MCP_PRESET` to load a named subset:

```json
"env": {
  "FIREFLY_URL": "https://your-firefly-instance.example.com",
  "FIREFLY_TOKEN": "your-personal-access-token-here",
  "MCP_PRESET": "default",
  "MCP_READ_ONLY": "true"
}
```

See [Tool filtering](/reference/filtering) for all preset names and group options.

## Optional: install globally

```bash
npm install -g @daften/fireflyiii-mcp
```

Then replace `"command": "npx", "args": ["-y", "@daften/fireflyiii-mcp"]` with `"command": "fireflyiii-mcp"`.
