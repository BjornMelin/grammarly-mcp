# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build          # Compile TypeScript to dist/
pnpm start          # Run the MCP server (requires env vars)
pnpm type-check     # TypeScript type checking only
pnpm biome:check    # Lint + format check (no writes)
pnpm biome:fix      # Auto-fix lint + format issues
pnpm check-all      # Run type-check && biome:check

# Testing
pnpm test           # Run tests in watch mode
pnpm test:run       # Run tests once
pnpm test:coverage  # Run tests with coverage report
pnpm test:unit      # Run unit tests only
pnpm test:integration  # Run integration tests (forks pool)
pnpm test:ci        # CI mode with coverage + JSON reporter
```

## Testing

**Framework**: Vitest with V8 coverage provider.

**Coverage thresholds** (enforced in CI):
- Lines: 85%
- Functions: 85%
- Branches: 75%
- Statements: 85%

**Test structure**:
```
tests/
├── setup.ts              # Global test setup
├── unit/                 # Fast, isolated unit tests
│   ├── config.test.ts
│   ├── server.test.ts
│   ├── schemas.test.ts
│   ├── grammarlyOptimizer.test.ts
│   ├── browser/
│   │   ├── provider.test.ts
│   │   ├── browserUseProvider.test.ts
│   │   ├── grammarlyTask.test.ts
│   │   └── stagehand/
│   │       ├── sessionManager.test.ts
│   │       ├── stagehandProvider.test.ts
│   │       └── grammarlyTask.test.ts
│   └── llm/
│       ├── claudeClient.test.ts
│       └── stagehandLlm.test.ts
└── integration/          # Tests requiring more isolation
    └── stagehandProvider.test.ts
```

**Mock patterns**:
- Use `vi.mock()` for module mocks; import after mocking
- Use `vi.fn()` for function mocks with `mockResolvedValue`/`mockRejectedValue`
- Use `vi.useFakeTimers()` for retry/backoff tests
- Stub `setTimeout` globally to skip `sleep()` delays in Stagehand tests

**Key conventions**:
- All tests are synchronous by default; async only when awaiting promises
- Mock at module boundaries (SDK clients, external services)
- Use `test.each()` for parameterized edge cases
- Attach catch handlers before advancing fake timers to prevent unhandled rejections

## Architecture

Single-tool MCP server with dual browser automation providers:

```text
MCP Server (stdio transport)
    └── grammarly_optimize_text tool
        │
        ├── grammarlyOptimizer.ts  (orchestration + iteration loop)
        │    │
        │    └── browser/provider.ts  (provider abstraction)
        │        │
        │        ├── stagehand/  (PRIMARY - default)
        │        │   ├── index.ts         (StagehandProvider)
        │        │   ├── sessionManager.ts (Browserbase sessions/contexts)
        │        │   ├── grammarlyTask.ts  (observe->act->extract)
        │        │   └── schemas.ts        (Zod extraction schemas)
        │        │
        │        └── browserUseProvider.ts  (FALLBACK)
        │            └── grammarlyTask.ts (Browser Use Cloud)
        │
        ├── llm/
        │   ├── stagehandLlm.ts   (multi-provider LLM for Stagehand)
        │   └── claudeClient.ts   (Claude for rewrites via Vercel AI SDK)
        │
        └── config.ts  (dual-provider env validation, logging)
```

## Provider Selection

Set via `BROWSER_PROVIDER` env var: `stagehand` (default) or `browser-use`.

**Stagehand (default):** Browserbase cloud browsers with deterministic
observe->act->extract pattern. Supports session persistence, self-healing,
action caching.

**Browser Use (fallback):** Browser Use Cloud with natural language tasks.
Simpler setup, less reliable for production.

## Execution Flow

**Stagehand path:**

1. Get or create Browserbase session with optional context (login persistence)
2. Initialize Stagehand instance connected to session
3. Navigate to app.grammarly.com
4. observe() to find UI elements (new doc button, AI detector)
5. act() to interact (click, type text)
6. extract() with Zod schema to get structured scores
7. Close session; context persists for future use

**Optimization loop (both providers):**

1. Create browser session
2. Score original text (iteration 0)
3. Loop up to max_iterations:
   - Claude rewrites text based on scores + tone + domain
   - Re-score via Grammarly UI
   - Break early if thresholds met
4. Claude generates final summary

## Key Conventions

- **Logging**: All logs to stderr via `log()` from config.ts. stdout reserved for MCP JSON-RPC.
- **Zod schemas**: Input/output validation at tool boundaries; extraction schemas for Stagehand.
- **Provider abstraction**: BrowserProvider interface in provider.ts. Implementations must provide createSession(), scoreText(), closeSession().
- **Stagehand pattern**: observe() for element discovery, act() for interaction, extract() for structured data.
- **Session persistence**: Browserbase contexts store login state. Set BROWSERBASE_CONTEXT_ID to skip Grammarly login on subsequent runs.
- **Self-healing**: Stagehand's selfHeal option handles DOM changes automatically.
- **Model selection**: Claude Sonnet default; Opus for long inputs (>12k chars) or heavy loops (>8 iterations).
- **Null scores**: Grammarly features may return null without Premium subscription.

## Environment Variables

### Provider Config

- `BROWSER_PROVIDER` - `stagehand` (default) or `browser-use`

### Stagehand (when BROWSER_PROVIDER=stagehand)

- `BROWSERBASE_API_KEY` - Required. From browserbase.com
- `BROWSERBASE_PROJECT_ID` - Required. From Browserbase dashboard
- `BROWSERBASE_CONTEXT_ID` - Optional. Persistent login context
- `BROWSERBASE_SESSION_ID` - Optional. Reuse existing session
- `STAGEHAND_MODEL` - Optional. LLM model (default: gpt-4o)
- `STAGEHAND_CACHE_DIR` - Optional. Action caching directory

### Browser Use (when BROWSER_PROVIDER=browser-use)

- `BROWSER_USE_API_KEY` - Required. From cloud.browser-use.com
- `BROWSER_USE_PROFILE_ID` - Required. Synced profile with Grammarly login

### Claude & General

- `CLAUDE_API_KEY` - Optional. Falls back to `claude login` CLI auth
- `LOG_LEVEL` - debug | info | warn | error (default: info)

## Key Files

| File | Purpose |
|------|---------|
| `src/browser/provider.ts` | Provider interface and factory function |
| `src/browser/stagehand/index.ts` | StagehandProvider implementation |
| `src/browser/stagehand/sessionManager.ts` | Browserbase session/context lifecycle |
| `src/browser/stagehand/grammarlyTask.ts` | Grammarly automation (observe/act/extract) |
| `src/browser/stagehand/schemas.ts` | Zod schemas for score extraction |
| `src/browser/browserUseProvider.ts` | Browser Use provider (fallback) |
| `src/llm/stagehandLlm.ts` | Multi-provider LLM client for Stagehand |
| `src/llm/claudeClient.ts` | Claude client for text rewriting |
| `src/grammarlyOptimizer.ts` | Main optimization loop with retry logic |
| `src/config.ts` | Environment validation and AppConfig |
