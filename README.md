# Grammarly MCP Server

Single-tool Model Context Protocol (MCP) server for AI detection and plagiarism scoring via Grammarly's web interface. Supports two browser automation providers: **Stagehand + Browserbase** (default) and **Browser Use Cloud** (fallback).

## What it does

- Automates Grammarly's docs UI to get AI detection and plagiarism percentages
- Rewrites text via Claude to reduce AI detection scores
- Exposes one MCP tool: `grammarly_optimize_text`

> **Note:** This server interacts with app.grammarly.com through browser automation. It does not use Grammarly APIs.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Provider Selection](#provider-selection)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [Client Configuration](#client-configuration)
- [Tool: grammarly_optimize_text](#tool-grammarly_optimize_text)
- [Session Persistence](#session-persistence)
- [How It Works](#how-it-works)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)
- [Notes and Limitations](#notes-and-limitations)
- [License](#license)

---

## Quick Start

### Option A: Stagehand + Browserbase (Recommended)

**Prerequisites:** Node.js 18+, Grammarly Pro account, [Browserbase](https://www.browserbase.com) account

```bash
# 1. Clone and build
git clone https://github.com/BjornMelin/grammarly-mcp.git
cd grammarly-mcp
pnpm install && pnpm build

# 2. Get Browserbase credentials
# - Sign up at https://www.browserbase.com
# - Create a project, note the Project ID
# - Generate an API key

# 3. Set up Claude Code CLI (for text rewriting)
npm install -g @anthropic-ai/claude-code
claude login

# 4. Configure environment
cp .env.example .env
# Edit .env with your Browserbase credentials

# 5. Add to Claude Code
claude mcp add grammarly -- node $(pwd)/dist/server.js

# 6. Test
claude "Use grammarly_optimize_text with mode score_only on: Hello world test"
```

### Option B: Browser Use Cloud (Legacy)

**Prerequisites:** Node.js 18+, Grammarly Pro account, [Browser Use Cloud](https://cloud.browser-use.com) account

```bash
# 1. Clone and build
git clone https://github.com/BjornMelin/grammarly-mcp.git
cd grammarly-mcp
pnpm install && pnpm build

# 2. Get Browser Use credentials
# - Sign up at https://cloud.browser-use.com
# - Create API key (bu_...)
# - Create profile and sync Grammarly login (profile_...)

# 3. Set up Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude login

# 4. Configure environment
cp .env.example .env
# Set BROWSER_PROVIDER=browser-use and Browser Use credentials

# 5. Add to Claude Code
claude mcp add grammarly -- node $(pwd)/dist/server.js
```

---

## Features

- **Dual provider support**: Stagehand + Browserbase (default) or Browser Use Cloud (fallback)
- **Session persistence**: Browserbase contexts preserve Grammarly login across sessions
- **Self-healing automation**: Stagehand adapts to DOM changes automatically
- **Multi-LLM support**: Claude Code CLI, OpenAI, Anthropic, or Google for browser automation
- **Live debug URLs**: Real-time browser preview during execution
- **Action caching**: Optional caching for faster repeated operations
- **Structured output**: JSON or markdown response formats
- **Progress notifications**: MCP 2025-11-25 progress tracking support

---

## Requirements

### All Configurations

- Node.js 18+
- Grammarly Pro account (for AI detection and plagiarism features)
- Claude Code CLI for text rewriting:

  ```bash
  npm install -g @anthropic-ai/claude-code
  claude login
  ```

### Stagehand Provider (Default)

- [Browserbase](https://www.browserbase.com) account
- `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`

### Browser Use Provider (Fallback)

- [Browser Use Cloud](https://cloud.browser-use.com) account
- `BROWSER_USE_API_KEY` and `BROWSER_USE_PROFILE_ID`
- Browser profile synced with Grammarly login state

---

## Installation

```bash
git clone https://github.com/BjornMelin/grammarly-mcp.git
cd grammarly-mcp
pnpm install
pnpm build
```

---

## Provider Selection

This server supports two browser automation providers:

| Feature | Stagehand (Default) | Browser Use Cloud |
|---------|---------------------|-------------------|
| Provider | Browserbase | Browser Use Cloud |
| Automation | observe/act/extract | Natural language tasks |
| Self-healing | Yes | Limited |
| Session persistence | Context IDs | Profile sync |
| Debug URL | Real-time | Per-task |
| Action caching | Yes | No |
| Reliability | Higher | Moderate |

### When to Use Stagehand

- Production workloads requiring reliability
- Need session persistence to avoid re-login overhead
- Want real-time debug visibility
- Require self-healing for Grammarly UI changes

### When to Use Browser Use Cloud

- Existing Browser Use Cloud setup
- Prefer simpler natural language task descriptions
- One-off or testing scenarios

Set the provider via environment variable:

```bash
BROWSER_PROVIDER=stagehand  # Default
BROWSER_PROVIDER=browser-use  # Fallback
```

---

## Environment Variables

### Provider Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BROWSER_PROVIDER` | No | `stagehand` | `stagehand` or `browser-use` |

### Stagehand + Browserbase

Required when `BROWSER_PROVIDER=stagehand`:

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | Yes | API key from [browserbase.com](https://www.browserbase.com) |
| `BROWSERBASE_PROJECT_ID` | Yes | Project ID from Browserbase dashboard |
| `BROWSERBASE_CONTEXT_ID` | No | Persistent context for Grammarly login state |
| `BROWSERBASE_SESSION_ID` | No | Reuse existing session (advanced) |
| `STAGEHAND_MODEL` | No | LLM for Stagehand automation (default: `gpt-4o`) |
| `STAGEHAND_CACHE_DIR` | No | Directory for action caching |

### Browser Use Cloud

Required when `BROWSER_PROVIDER=browser-use`:

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSER_USE_API_KEY` | Yes | API key from [cloud.browser-use.com](https://cloud.browser-use.com) |
| `BROWSER_USE_PROFILE_ID` | Yes | Profile with synced Grammarly login |

### Claude Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_API_KEY` | No | API key for Claude. If not set, uses `claude login` CLI auth |

### Timeouts and Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `CLAUDE_REQUEST_TIMEOUT_MS` | No | `120000` | Claude request timeout (ms) |
| `CONNECT_TIMEOUT_MS` | No | `30000` | MCP connection timeout (ms) |

---

## Running the Server

```bash
pnpm start
# or
node dist/server.js
```

The server uses stdio transport for MCP communication.

---

## Client Configuration

### Claude Code CLI

```bash
claude mcp add grammarly -- node /path/to/dist/server.js
```

Or with environment variables:

```bash
claude mcp add grammarly -- \
  env BROWSER_PROVIDER=stagehand \
      BROWSERBASE_API_KEY=bb_... \
      BROWSERBASE_PROJECT_ID=... \
  node /path/to/dist/server.js
```

### Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_...",
        "BROWSERBASE_PROJECT_ID": "...",
        "BROWSERBASE_CONTEXT_ID": "..."
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_...",
        "BROWSERBASE_PROJECT_ID": "..."
      }
    }
  }
}
```

### VS Code (Continue)

Add to `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/absolute/path/to/dist/server.js"],
          "env": {
            "BROWSER_PROVIDER": "stagehand",
            "BROWSERBASE_API_KEY": "bb_...",
            "BROWSERBASE_PROJECT_ID": "..."
          }
        }
      }
    ]
  }
}
```

### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_...",
        "BROWSERBASE_PROJECT_ID": "..."
      }
    }
  }
}
```

### OpenAI Codex CLI

```json
{
  "mcp_servers": {
    "grammarly": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_...",
        "BROWSERBASE_PROJECT_ID": "..."
      }
    }
  }
}
```

### Generic stdio MCP Hosts

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["/absolute/path/to/dist/server.js"],
  "env": {
    "BROWSER_PROVIDER": "stagehand",
    "BROWSERBASE_API_KEY": "bb_...",
    "BROWSERBASE_PROJECT_ID": "..."
  }
}
```

---

## Tool: grammarly_optimize_text

### Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | *(required)* | Text to analyze/optimize |
| `mode` | enum | `optimize` | `score_only`, `optimize`, or `analyze` |
| `max_ai_percent` | number | `10` | Target AI detection threshold (0-100) |
| `max_plagiarism_percent` | number | `5` | Target plagiarism threshold (0-100) |
| `max_iterations` | number | `5` | Maximum rewrite iterations (1-20) |
| `tone` | enum | `neutral` | `neutral`, `formal`, `informal`, `academic`, `custom` |
| `domain_hint` | string | — | Domain context (e.g., "legal", "medical") |
| `custom_instructions` | string | — | Additional rewriting instructions |
| `proxy_country_code` | string | — | ISO 3166-1 alpha-2 country code for geo-routing |
| `response_format` | enum | `json` | `json` or `markdown` |
| `max_steps` | number | `25` | Maximum browser automation steps (5-100) |

### Output Schema

```json
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
  "notes": "string",
  "live_url": "string | null",
  "provider": "string"
}
```

### Stagehand LLM Configuration

When using Stagehand, the server automatically selects an LLM for browser automation:

**Priority order:**

1. **Claude Code CLI** (default) - Uses `claude login` authentication
2. **OpenAI** - Requires `OPENAI_API_KEY`
3. **Anthropic** - Requires `ANTHROPIC_API_KEY`
4. **Google** - Requires `GOOGLE_GENERATIVE_AI_API_KEY`

Override with `STAGEHAND_MODEL`:

```bash
STAGEHAND_MODEL=gpt-4o        # Default
STAGEHAND_MODEL=gpt-4o-mini   # Budget option
```

### Browser Use LLM Options

When using Browser Use Cloud (`BROWSER_PROVIDER=browser-use`), the automation uses Browser Use's built-in LLM at $0.002/step.

---

## Session Persistence

Browserbase contexts allow you to persist Grammarly login state across sessions.

### How Persistence Works

1. **First run**: Server creates a Browserbase session. Use the debug URL to manually log into Grammarly.
2. **Note context ID**: The context ID appears in server logs or session response.
3. **Subsequent runs**: Set `BROWSERBASE_CONTEXT_ID` to skip login.

### Setup

```bash
# First run - no context, log in manually via debug URL
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=...

# After logging in, add context ID for subsequent runs
BROWSERBASE_CONTEXT_ID=ctx_...
```

### Performance

| Scenario | Initialization Time |
|----------|---------------------|
| New session, no context | ~30-45 seconds |
| Existing context | ~5-10 seconds |
| Reusing active session | ~1-2 seconds |

---

## How It Works

### Architecture

```text
MCP Client (Claude Code, Cursor, VS Code, etc.)
    │
    └── grammarly_optimize_text tool
        │
        ├── Provider Abstraction
        │    ├── StagehandProvider (default)
        │    │   ├── BrowserbaseSessionManager
        │    │   ├── Stagehand (observe/act/extract)
        │    │   └── Multi-LLM Client
        │    │
        │    └── BrowserUseProvider (fallback)
        │        └── Browser Use SDK
        │
        └── Claude Client (text rewriting)
            └── ai-sdk-provider-claude-code
```

### Stagehand Flow

1. Get or create Browserbase session with optional context
2. Initialize Stagehand instance connected to session
3. Navigate to app.grammarly.com
4. Use `observe()` to find UI elements (new document button, AI detector)
5. Use `act()` to interact (click, type text)
6. Use `extract()` with Zod schema to get structured scores
7. Return scores with debug URL

### Browser Use Flow

1. Create Browser Use session with synced profile
2. Send natural language task to Browser Use agent
3. Agent navigates Grammarly, pastes text, runs checks
4. Return structured scores

### Optimization Loop

1. **Initial scoring** (iteration 0) on original text
2. **In optimize mode**: Loop up to `max_iterations`:
   - Claude rewrites text based on current scores, tone, domain
   - Re-score via Grammarly
   - Break early if thresholds met
3. **Generate summary** via Claude

---

## Development

### Build & Quality

```bash
pnpm install        # Install dependencies
pnpm build          # Compile TypeScript
pnpm type-check     # Type checking only
pnpm biome:check    # Lint + format check
pnpm biome:fix      # Auto-fix lint + format
pnpm check-all      # Type check + lint
```

### Testing

```bash
pnpm test           # Watch mode
pnpm test:run       # Run once
pnpm test:coverage  # With coverage report
pnpm test:unit      # Unit tests only
pnpm test:integration  # Integration tests
```

**Coverage thresholds** (enforced in CI): 85% lines, 85% functions, 75% branches.

Tests use Vitest with V8 coverage. See `tests/` for test structure and `CLAUDE.md` for testing conventions.

---

## Troubleshooting

### Server Issues

#### Server won't start

Check that required environment variables are set:

- Stagehand: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`
- Browser Use: `BROWSER_USE_API_KEY`, `BROWSER_USE_PROFILE_ID`

#### Tool not appearing in client

- Verify path to `dist/server.js` is absolute and correct
- Run `pnpm build` to ensure compilation succeeded
- Restart your MCP client after configuration changes

### Stagehand Issues

#### Browserbase session creation fails

- Verify API key and project ID at [browserbase.com](https://www.browserbase.com)
- Check Browserbase dashboard for quota/limits

#### Context not persisting login

- Ensure you logged into Grammarly while context was active
- Context ID must match the session where login occurred
- Grammarly sessions may expire; re-login if needed

#### Self-heal failures

- Grammarly UI may have changed significantly
- Try with `LOG_LEVEL=debug` to see Stagehand observations
- Report persistent issues

### Browser Use Issues

#### Session creation fails

- Verify API key at [cloud.browser-use.com](https://cloud.browser-use.com)
- Check that profile exists and is properly synced

#### Profile sync issues

- Re-sync your Grammarly login using Browser Use tools
- Grammarly cookies may have expired

### Grammarly Issues

#### AI detection scores are null

Your Grammarly plan may not include AI Detector. This requires Grammarly Pro with AI detection enabled.

#### Plagiarism scores are null

Plagiarism checking requires Grammarly Pro subscription.

### Claude Issues

#### Authentication errors

Using CLI auth (recommended):

```bash
claude logout
claude login
```

Using API key:
Ensure `CLAUDE_API_KEY` is set correctly.

---

## Security Considerations

- **API Keys**: Store securely. Never commit to version control.
- **Browserbase Contexts**: Contain session cookies. Treat context IDs as sensitive.
- **Browser Use Profiles**: Contain Grammarly session state. Treat profile IDs as sensitive.
- **Data Flow**: Text passes through:
    1. Browserbase or Browser Use Cloud (browser automation)
    2. Grammarly (via web UI)
    3. Claude API (for rewriting)

    Review each service's privacy policy.
- **Local Execution**: MCP server runs locally via stdio, not over network.

---

## Notes and Limitations

- **Grammarly Pro Required**: AI Detector and Plagiarism Checker require Grammarly Pro. Scores return `null` if unavailable.
- **UI Dependency**: Automation uses observe/act/extract (Stagehand) or natural language (Browser Use). Grammarly UI changes may affect reliability.
- **Text Length**: Very long texts may exceed context limits. Consider chunking.
- **Rate Limits**: Browserbase, Browser Use Cloud, and Grammarly have usage limits.
- **Session Limits**: Browserbase sessions have timeout limits. Use contexts for persistence.

---

## External Resources

- **Browserbase**: [browserbase.com](https://www.browserbase.com) | [Docs](https://docs.browserbase.com)
- **Stagehand**: [GitHub](https://github.com/browserbase/stagehand) | [Docs](https://docs.stagehand.dev)
- **Browser Use**: [cloud.browser-use.com](https://cloud.browser-use.com) | [Docs](https://docs.browser-use.com)
- **Claude Code**: [ai-sdk-provider-claude-code](https://github.com/anthropics/ai-sdk-provider-claude-code)
- **MCP**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

---

## License

MIT License - see [LICENSE](LICENSE) for details.
