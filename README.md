# Grammarly Browser Use MCP Server

Single-tool Model Context Protocol (MCP) server that:

- Uses **Browser Use Cloud** to drive a real browser session bound to a
  **Browser Use profile** already logged into Grammarly / Superhuman docs.
- Uses **Grammarly's docs UI** (AI Detector + Plagiarism Checker agents) to
  obtain AI detection and plagiarism scores – **no Grammarly APIs**.
- Uses **Vercel AI SDK v5 (`ai`) + `ai-sdk-provider-claude-code`** to analyze
  and rewrite text via your Claude Pro / Max / Claude Code setup.
- Exposes exactly **one MCP tool**: `grammarly_optimize_text`.

> **Note:** This server never calls Grammarly's public or enterprise APIs. It only
> interacts with the app.grammarly.com docs UI through Browser Use Cloud.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Client Configuration](#client-configuration)
  - [Claude Code CLI](#claude-code-cli)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [VS Code (Copilot / Continue)](#vs-code-copilot--continue)
  - [Windsurf](#windsurf)
  - [OpenAI Codex CLI](#openai-codex-cli)
  - [Generic stdio MCP Hosts](#generic-stdio-mcp-hosts)
- [Tool: grammarly_optimize_text](#tool-grammarly_optimize_text)
- [How It Works](#how-it-works)
- [Example Usage](#example-usage)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)
- [Notes and Limitations](#notes-and-limitations)
- [License](#license)

---

## Requirements

- **Node.js 18+**
- **Browser Use Cloud** account and API key (`BROWSER_USE_API_KEY`)
  - Sign up at [cloud.browser-use.com](https://cloud.browser-use.com)
- **Browser Use profile** synced with your logged-in Grammarly session (`BROWSER_USE_PROFILE_ID`)
  - See [Browser Use Cloud Docs](https://docs.browser-use.com/cloud/persistent-browser) for profile setup
- **Claude Code CLI** authenticated (for rewriting functionality):

  ```bash
  npm install -g @anthropic-ai/claude-code
  claude login   # Uses your Claude Pro/Max subscription
  ```

  > **Note:** If you have a Claude Pro or Max subscription, `claude login` is the recommended authentication method — no API key needed, and usage counts against your subscription (not billed separately).

- **npm**, **pnpm**, or **yarn** for installing dependencies

---

## Installation

```bash
git clone https://github.com/your-username/grammarly-browseruse-mcp-server.git
cd grammarly-browseruse-mcp-server

npm install   # or: pnpm install
npm run build
```

---

## Environment Variables

Set required environment variables before running:

```bash
export BROWSER_USE_API_KEY="bu_..."           # from cloud.browser-use.com
export BROWSER_USE_PROFILE_ID="profile_..."   # profile synced with Grammarly login
export LOG_LEVEL="info"                       # optional: debug | info | warn | error

# Optional: Claude API key (only if not using 'claude login')
# export CLAUDE_API_KEY="sk-ant-..."          # for API key billing instead of subscription
```

**Creating a Browser Use profile:**

1. Log into Grammarly in your local browser
2. Use Browser Use Cloud's profile sync tool to capture your session:
   ```bash
   npx browser-use-profile sync
   ```
3. Note the returned `profile_id` and set it as `BROWSER_USE_PROFILE_ID`

---

## Running the Server

After building:

```bash
npm start
# or directly:
node dist/server.js
```

The server communicates over **stdio** (standard input/output), which is the standard transport for local MCP servers.

---

## Client Configuration

### Claude Code CLI

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or via CLI):

```bash
claude mcp add grammarly-browseruse -- node /absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js
```

Or manually edit the config:

```json
{
  "mcpServers": {
    "grammarly-browseruse": {
      "command": "node",
      "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
      "env": {
        "BROWSER_USE_API_KEY": "bu_...",
        "BROWSER_USE_PROFILE_ID": "profile_..."
      }
    }
  }
}
```

### Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grammarly-browseruse": {
      "command": "node",
      "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
      "env": {
        "BROWSER_USE_API_KEY": "bu_...",
        "BROWSER_USE_PROFILE_ID": "profile_..."
      }
    }
  }
}
```

Restart Claude Desktop after saving. The `grammarly_optimize_text` tool should appear.

### Cursor

Add to Cursor's MCP configuration (`.cursor/mcp.json` in your project or global settings):

```json
{
  "mcpServers": {
    "grammarly-browseruse": {
      "command": "node",
      "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
      "env": {
        "BROWSER_USE_API_KEY": "bu_...",
        "BROWSER_USE_PROFILE_ID": "profile_..."
      }
    }
  }
}
```

Reload Cursor or restart the MCP extension to activate.

### VS Code (Copilot / Continue)

For **Continue** extension, add to `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
          "env": {
            "BROWSER_USE_API_KEY": "bu_...",
            "BROWSER_USE_PROFILE_ID": "profile_..."
          }
        }
      }
    ]
  }
}
```

For **GitHub Copilot** with MCP support (if available), check Copilot documentation for MCP server configuration.

### Windsurf

Add to Windsurf's MCP configuration file (`~/.windsurf/mcp.json` or project-level):

```json
{
  "mcpServers": {
    "grammarly-browseruse": {
      "command": "node",
      "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
      "env": {
        "BROWSER_USE_API_KEY": "bu_...",
        "BROWSER_USE_PROFILE_ID": "profile_..."
      }
    }
  }
}
```

### OpenAI Codex CLI

For OpenAI's Codex CLI with MCP support, add to your Codex configuration:

```json
{
  "mcp_servers": {
    "grammarly-browseruse": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
      "env": {
        "BROWSER_USE_API_KEY": "bu_...",
        "BROWSER_USE_PROFILE_ID": "profile_..."
      }
    }
  }
}
```

### Generic stdio MCP Hosts

Any MCP-compatible host supporting stdio transport can use:

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["/absolute/path/to/grammarly-browseruse-mcp-server/dist/server.js"],
  "env": {
    "BROWSER_USE_API_KEY": "bu_...",
    "BROWSER_USE_PROFILE_ID": "profile_..."
  }
}
```

---

## Tool: `grammarly_optimize_text`

### Input Schema

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | *(required)* | The text to analyze/optimize |
| `mode` | enum | `"optimize"` | `"score_only"`, `"optimize"`, or `"analyze"` |
| `max_ai_percent` | number | `10` | Target AI detection threshold (%) |
| `max_plagiarism_percent` | number | `5` | Target plagiarism threshold (%) |
| `max_iterations` | number | `5` | Maximum rewrite iterations |
| `tone` | enum | `"neutral"` | `"neutral"`, `"formal"`, `"informal"`, `"academic"`, `"custom"` |
| `domain_hint` | string | — | Optional domain context (e.g., "legal", "medical") |
| `custom_instructions` | string | — | Additional rewriting instructions |

### Output Schema

```jsonc
{
  "final_text": "string",
  "ai_detection_percent": "number | null",
  "plagiarism_percent": "number | null",
  "iterations_used": "number",
  "thresholds_met": "boolean",
  "history": [
    {
      "iteration": "number",
      "ai_detection_percent": "number | null",
      "plagiarism_percent": "number | null",
      "note": "string"
    }
  ],
  "notes": "string"
}
```

The result is returned as both structured JSON and a `text` content block for compatibility with all MCP hosts.

---

## How It Works

### 1. Browser Use + Grammarly Docs

The server uses Browser Use Cloud via `browser-use-sdk`:

```
sessions.createSession({ profileId: BROWSER_USE_PROFILE_ID })
tasks.createTask({ sessionId, llm: "browser-use-llm", task, schema })
```

The automated browser agent:
1. Opens `https://app.grammarly.com`
2. Creates a new document
3. Pastes your text
4. Runs AI Detector + Plagiarism Checker agents
5. Returns structured scores (`aiDetectionPercent`, `plagiarismPercent`)

### 2. Claude via Vercel AI SDK v5

Rewriting and analysis use `ai-sdk-provider-claude-code`:

```typescript
// Structured rewrites
generateObject({ model: claudeCode('sonnet'), schema, prompt })

// Text summaries
generateText({ model: claudeCode('sonnet'), prompt })
```

### 3. Optimization Loop

1. **Initial scoring** (iteration 0) on original text
2. **In `optimize` mode**: Rewrite → re-score loop up to `max_iterations`
3. **Early termination** when both AI and plagiarism thresholds are satisfied

---

## Example Usage

Once configured, you can invoke the tool from any MCP-compatible client:

**Score only (no rewriting):**
```
Use grammarly_optimize_text with mode "score_only" on this text:
"Your text here..."
```

**Full optimization:**
```
Optimize this text to reduce AI detection below 10%:
"Your text here..."
```

**Academic tone with custom instructions:**
```
Use grammarly_optimize_text with:
- mode: "optimize"
- tone: "academic"
- custom_instructions: "Maintain technical accuracy for a peer-reviewed journal"
- text: "Your research text here..."
```

---

## Troubleshooting

### Server won't start

**Problem:** `Error: BROWSER_USE_API_KEY is required`

**Solution:** Ensure environment variables are set before starting the server, or include them in your MCP client configuration's `env` block.

### Browser Use session fails

**Problem:** `Session creation failed` or timeout errors

**Solution:**
1. Verify your `BROWSER_USE_API_KEY` is valid at [cloud.browser-use.com](https://cloud.browser-use.com)
2. Check that your profile ID exists and is properly synced
3. Ensure your Grammarly session hasn't expired in the synced profile

### AI detection scores are null

**Problem:** `ai_detection_percent` returns `null`

**Solution:** Your Grammarly plan may not include AI Detector. This feature requires Grammarly Premium or Business plans with AI detection enabled.

### Tool not appearing in client

**Problem:** The `grammarly_optimize_text` tool doesn't show up

**Solution:**
1. Verify the path to `dist/server.js` is absolute and correct
2. Check that `npm run build` completed successfully
3. Restart your MCP client after configuration changes
4. Check client logs for MCP connection errors

### Claude Code authentication issues

**Problem:** Rewriting fails with authentication errors

**Solution (for CLI auth / Pro/Max subscription):**
```bash
claude logout
claude login
```

**Solution (for API key auth):**
Ensure `CLAUDE_API_KEY` is set correctly in your environment or MCP client's `env` block.

---

## Security Considerations

- **API Keys**: Store `BROWSER_USE_API_KEY` securely. Never commit it to version control.
- **Browser Profile**: Your Browser Use profile contains session cookies for Grammarly. Treat the profile ID as sensitive.
- **Text Privacy**: Text sent through this tool passes through:
  1. Browser Use Cloud (for browser automation)
  2. Grammarly (via their web UI)
  3. Claude API (for rewriting)

  Review each service's privacy policy for your use case.
- **Local Execution**: The MCP server runs locally and communicates via stdio, not over the network.

---

## Notes and Limitations

- **Grammarly Plan Required**: AI Detector and Plagiarism Checker require a Grammarly Premium or Business plan. If unavailable, scores return `null`.
- **UI Dependency**: Browser Use uses natural-language element discovery, not fixed CSS selectors. Grammarly UI changes may break automation.
- **Text Length Limits**: Very long texts may exceed Browser Use or Claude context limits. Consider chunking in your MCP host logic.
- **Rate Limits**: Browser Use Cloud and Grammarly may have usage limits. Monitor your quotas.
- **Progress notifications**: The server uses the public progress-token accessor when available in `@modelcontextprotocol/sdk` (expected in versions ≥ 1.25.x) and falls back to a guarded private `_meta` read on older SDKs.

---

## License

MIT License - see [LICENSE](LICENSE) for details.
