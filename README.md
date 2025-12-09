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
- **Multi-LLM support**: Separate providers for browser automation (`STAGEHAND_LLM_PROVIDER`) and text rewriting (`REWRITE_LLM_PROVIDER`)
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
| --- | --- | --- |
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

### Environment Isolation

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `IGNORE_SYSTEM_ENV` | No | `false` | When `true`, ignores shell env vars and uses only `.env` file. Prevents IDE-inherited env pollution. |

### Provider Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `BROWSER_PROVIDER` | No | `stagehand` | `stagehand` or `browser-use` |

### Stagehand + Browserbase

Required when `BROWSER_PROVIDER=stagehand`:

| Variable | Required | Description |
| --- | --- | --- |
| `BROWSERBASE_API_KEY` | Yes | API key from [browserbase.com](https://www.browserbase.com) |
| `BROWSERBASE_PROJECT_ID` | Yes | Project ID from Browserbase dashboard |
| `BROWSERBASE_CONTEXT_ID` | No | Persistent context for Grammarly login state |
| `BROWSERBASE_SESSION_ID` | No | Reuse existing session (advanced) |
| `STAGEHAND_MODEL` | No | **Deprecated.** Use `STAGEHAND_LLM_PROVIDER` + model vars instead |
| `STAGEHAND_CACHE_DIR` | No | Directory for action caching |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No\* | Google API key for Gemini models. Also accepts `GEMINI_API_KEY` |

\* Required when using Google/Gemini models (the default). Get from [aistudio.google.com](https://aistudio.google.com/apikey).

### Browser Use Cloud

Required when `BROWSER_PROVIDER=browser-use`:

| Variable | Required | Description |
| --- | --- | --- |
| `BROWSER_USE_API_KEY` | Yes | API key from [cloud.browser-use.com](https://cloud.browser-use.com) |
| `BROWSER_USE_PROFILE_ID` | Yes | Profile with synced Grammarly login |

### LLM Provider Controls

Separate LLM providers for browser automation and text rewriting (can use different providers):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `STAGEHAND_LLM_PROVIDER` | No | Auto-detect | LLM for browser automation: `claude-code`, `openai`, `google`, `anthropic` |
| `REWRITE_LLM_PROVIDER` | No | Auto-detect | LLM for text rewriting: `claude-code`, `openai`, `google`, `anthropic` |

If not set, auto-detects from API keys (priority: OpenAI > Google > Anthropic > Claude Code).

### Model Selection

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CLAUDE_MODEL` | No | `auto` | Claude model: `auto`, `haiku`, `sonnet`, `opus`. Auto-selects based on text length and iteration count. |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Anthropic model id when using direct Anthropic provider. |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model name |
| `GOOGLE_MODEL` | No | `gemini-2.5-flash` | Google/Gemini model name |

### API Keys

| Variable | Required | Description |
| --- | --- | --- |
| `CLAUDE_API_KEY` | No | Claude API key. If not set, uses `claude login` CLI auth |
| `OPENAI_API_KEY` | No\* | OpenAI API key. Required when using OpenAI provider. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No\* | Google API key. Also accepts `GEMINI_API_KEY`. Required for Google provider. |
| `ANTHROPIC_API_KEY` | No\* | Anthropic API key. Required when using direct Anthropic provider. |

\* Required when explicitly setting the corresponding LLM provider or for auto-detection.

### Timeouts and Logging

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `LLM_REQUEST_TIMEOUT_MS` | No | `120000` | LLM request timeout (ms). `CLAUDE_REQUEST_TIMEOUT_MS` is still accepted for compatibility. |
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

Configure environment variables in your MCP client. Required:

- `BROWSERBASE_API_KEY` - From [browserbase.com](https://browserbase.com)
- `BROWSERBASE_PROJECT_ID` - From Browserbase dashboard

### Automatic Setup

Run the interactive setup script to automatically configure your MCP clients using values from your `.env` file:

```bash
# First, configure your .env file with credentials
cp .env.example .env
# Edit .env with your API keys

# Run the setup script
pnpm setup-clients
```

The script will:
- Show available MCP clients for your platform
- Let you select which clients to configure
- Back up existing configs before modifying
- Write the appropriate config format (JSON or TOML)

### Manual Configuration

<details>
<summary><b>Claude Code CLI</b></summary>

Via CLI command:

```bash
claude mcp add grammarly -e BROWSER_PROVIDER=stagehand \
  -e BROWSERBASE_API_KEY=bb_xxx \
  -e BROWSERBASE_PROJECT_ID=xxx \
  -- node /path/to/grammarly-mcp/dist/server.js
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

Or via UI: Settings → MCP → Add new MCP Server

</details>

<details>
<summary><b>VS Code (GitHub Copilot)</b></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

Or via CLI:

```bash
code --add-mcp '{"name":"grammarly","command":"node","args":["/path/to/grammarly-mcp/dist/server.js"]}'
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Gemini CLI</b></summary>

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "grammarly": {
      "command": "node",
      "args": ["/path/to/grammarly-mcp/dist/server.js"],
      "env": {
        "BROWSER_PROVIDER": "stagehand",
        "BROWSERBASE_API_KEY": "bb_xxx",
        "BROWSERBASE_PROJECT_ID": "xxx"
      }
    }
  }
}
```

</details>

<details>
<summary><b>OpenAI Codex CLI</b></summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.grammarly]
command = "node"
args = ["/path/to/grammarly-mcp/dist/server.js"]

[mcp_servers.grammarly.env]
BROWSER_PROVIDER = "stagehand"
BROWSERBASE_API_KEY = "bb_xxx"
BROWSERBASE_PROJECT_ID = "xxx"
```

</details>

<details>
<summary><b>Continue (VS Code Extension)</b></summary>

Add to `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/path/to/grammarly-mcp/dist/server.js"],
          "env": {
            "BROWSER_PROVIDER": "stagehand",
            "BROWSERBASE_API_KEY": "bb_xxx",
            "BROWSERBASE_PROJECT_ID": "xxx"
          }
        }
      }
    ]
  }
}
```

</details>

### Recommended Configurations

<details>
<summary><b>Minimal (Claude Pro/Max)</b></summary>

Uses your Claude subscription - no extra API keys:

```json
{
  "env": {
    "BROWSER_PROVIDER": "stagehand",
    "BROWSERBASE_API_KEY": "bb_xxx",
    "BROWSERBASE_PROJECT_ID": "xxx"
  }
}
```

</details>

<details>
<summary><b>Cost-Optimized (Always Haiku)</b></summary>

Forces the cheapest Claude model:

```json
{
  "env": {
    "BROWSER_PROVIDER": "stagehand",
    "BROWSERBASE_API_KEY": "bb_xxx",
    "BROWSERBASE_PROJECT_ID": "xxx",
    "CLAUDE_MODEL": "haiku"
  }
}
```

</details>

<details>
<summary><b>Mixed Providers (Fast + Quality)</b></summary>

Gemini for browser automation (fast), Claude for rewriting (quality):

```json
{
  "env": {
    "BROWSER_PROVIDER": "stagehand",
    "BROWSERBASE_API_KEY": "bb_xxx",
    "BROWSERBASE_PROJECT_ID": "xxx",
    "GOOGLE_GENERATIVE_AI_API_KEY": "xxx",
    "STAGEHAND_LLM_PROVIDER": "google",
    "REWRITE_LLM_PROVIDER": "claude-code",
    "CLAUDE_MODEL": "sonnet"
  }
}
```

</details>

<details>
<summary><b>Full Configuration (All Options)</b></summary>

```json
{
  "env": {
    "BROWSER_PROVIDER": "stagehand",
    "BROWSERBASE_API_KEY": "bb_xxx",
    "BROWSERBASE_PROJECT_ID": "xxx",
    "BROWSERBASE_CONTEXT_ID": "ctx_xxx",
    "STAGEHAND_LLM_PROVIDER": "google",
    "GOOGLE_GENERATIVE_AI_API_KEY": "xxx",
    "GOOGLE_MODEL": "gemini-2.5-flash",
    "REWRITE_LLM_PROVIDER": "claude-code",
    "CLAUDE_MODEL": "auto",
    "LOG_LEVEL": "info",
    "LLM_REQUEST_TIMEOUT_MS": "120000",
    "CONNECT_TIMEOUT_MS": "30000"
  }
}
```

</details>

---

## Tool: grammarly_optimize_text

### Input Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `text` | string | _(required)_ | Text to analyze/optimize |
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

### LLM Configuration

This server uses **separate LLM providers** for browser automation and text rewriting:

| Purpose | Env Var | Use Case |
| --- | --- | --- |
| Browser automation | `STAGEHAND_LLM_PROVIDER` | Stagehand observe/act/extract operations |
| Text rewriting | `REWRITE_LLM_PROVIDER` | Claude rewrites text to reduce AI detection |

**Example: Different providers for each task:**

```bash
# Fast Google for browser automation, quality Claude for rewriting
STAGEHAND_LLM_PROVIDER=google
GOOGLE_MODEL=gemini-2.5-flash
REWRITE_LLM_PROVIDER=claude-code
CLAUDE_MODEL=sonnet
```

**Auto-detection priority** (when provider not explicitly set):

1. **OpenAI** - If `OPENAI_API_KEY` is set
2. **Google** - If `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` is set
3. **Anthropic** - If `ANTHROPIC_API_KEY` is set
4. **Claude Code CLI** (fallback) - Uses `claude login` authentication

**Claude model auto-selection** (when `CLAUDE_MODEL=auto`):

| Text Length | Iterations | Model |
| --- | --- | --- |
| < 3k chars | ≤ 3 | Haiku (fastest, cheapest) |
| 3k-12k chars | 4-8 | Sonnet (balanced) |
| > 12k chars | > 8 | Opus (highest quality) |

### Browser Use LLM Options

When using Browser Use Cloud (`BROWSER_PROVIDER=browser-use`), the automation uses Browser Use's built-in LLM at $0.002/step. Text rewriting still uses the configured `REWRITE_LLM_PROVIDER`.

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
| --- | --- |
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
        └── Rewrite Client (multi-provider text rewriting)
            └── Claude Code / OpenAI / Google / Anthropic
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
   - LLM (via `REWRITE_LLM_PROVIDER`) rewrites text based on current scores, tone, domain
   - Re-score via Grammarly
   - Break early if thresholds met
3. **Generate summary** via configured rewrite LLM provider

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
