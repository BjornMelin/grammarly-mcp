import { z } from "zod";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  // Browser provider selection
  browserProvider: "stagehand" | "browser-use";

  // Browser Use Cloud (fallback provider)
  browserUseApiKey: string | undefined;
  browserUseProfileId: string | undefined;

  // Browserbase + Stagehand (primary provider)
  browserbaseApiKey: string | undefined;
  browserbaseProjectId: string | undefined;
  browserbaseSessionId: string | undefined;
  browserbaseContextId: string | undefined;
  stagehandModel: string | undefined;
  stagehandCacheDir: string | undefined;

  /** Optional: if not set, uses Claude CLI auth (via 'claude login') */
  claudeApiKey: string | undefined;
  claudeRequestTimeoutMs: number;
  connectTimeoutMs: number;
  logLevel: LogLevel;
  browserUseDefaultTimeoutMs: number;
  defaultMaxAiPercent: number;
  defaultMaxPlagiarismPercent: number;
  defaultMaxIterations: number;
}

const EnvSchema = z.object({
  // Provider selection: "stagehand" (default) or "browser-use" (fallback)
  BROWSER_PROVIDER: z.enum(["stagehand", "browser-use"]).default("stagehand"),

  // Browser Use Cloud (required when BROWSER_PROVIDER=browser-use)
  BROWSER_USE_API_KEY: z.string().optional(),
  BROWSER_USE_PROFILE_ID: z.string().optional(),

  // Browserbase + Stagehand (required when BROWSER_PROVIDER=stagehand)
  BROWSERBASE_API_KEY: z.string().optional(),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  BROWSERBASE_SESSION_ID: z.string().optional(),
  BROWSERBASE_CONTEXT_ID: z.string().optional(),
  STAGEHAND_MODEL: z.string().default("gemini-2.5-flash"),
  STAGEHAND_CACHE_DIR: z.string().optional(),

  // Claude API (optional - uses Claude Code CLI auth when not set)
  CLAUDE_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CLAUDE_REQUEST_TIMEOUT_MS: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return undefined;
  }, z.number().positive().optional()),
  CONNECT_TIMEOUT_MS: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return undefined;
  }, z.number().positive().optional()),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Log to stderr; MCP hosts expect stdout to be protocol-only.
  // Exiting early avoids a half-configured server.
  console.error(
    "[grammarly-mcp:error] Invalid environment configuration",
    JSON.stringify(parsed.error.format(), null, 2),
  );
  process.exit(1);
}

const env = parsed.data;

// Validate provider-specific required variables
if (env.BROWSER_PROVIDER === "stagehand") {
  if (!env.BROWSERBASE_API_KEY || !env.BROWSERBASE_PROJECT_ID) {
    console.error(
      "[grammarly-mcp:error] BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required when BROWSER_PROVIDER=stagehand",
    );
    process.exit(1);
  }
} else if (env.BROWSER_PROVIDER === "browser-use") {
  if (!env.BROWSER_USE_API_KEY || !env.BROWSER_USE_PROFILE_ID) {
    console.error(
      "[grammarly-mcp:error] BROWSER_USE_API_KEY and BROWSER_USE_PROFILE_ID are required when BROWSER_PROVIDER=browser-use",
    );
    process.exit(1);
  }
}

// Claude SDK reads API keys from environment variables at call time.
// If an API key is provided, set it for downstream SDK calls.
// If not provided, Claude Code uses CLI authentication ('claude login').
if (env.CLAUDE_API_KEY) {
  process.env.CLAUDE_API_KEY ??= env.CLAUDE_API_KEY;
  process.env.ANTHROPIC_API_KEY ??= env.CLAUDE_API_KEY;
}

// Default thresholds; can be overridden per-tool call via args.
export const config: AppConfig = {
  // Provider selection
  browserProvider: env.BROWSER_PROVIDER,

  // Browser Use Cloud (fallback)
  browserUseApiKey: env.BROWSER_USE_API_KEY,
  browserUseProfileId: env.BROWSER_USE_PROFILE_ID,

  // Browserbase + Stagehand (primary)
  browserbaseApiKey: env.BROWSERBASE_API_KEY,
  browserbaseProjectId: env.BROWSERBASE_PROJECT_ID,
  browserbaseSessionId: env.BROWSERBASE_SESSION_ID,
  browserbaseContextId: env.BROWSERBASE_CONTEXT_ID,
  stagehandModel: env.STAGEHAND_MODEL,
  stagehandCacheDir: env.STAGEHAND_CACHE_DIR,

  // Claude and general settings
  claudeApiKey: env.CLAUDE_API_KEY,
  claudeRequestTimeoutMs: env.CLAUDE_REQUEST_TIMEOUT_MS ?? 2 * 60 * 1000,
  connectTimeoutMs: env.CONNECT_TIMEOUT_MS ?? 30_000,
  logLevel: env.LOG_LEVEL,
  browserUseDefaultTimeoutMs: 5 * 60 * 1000,
  defaultMaxAiPercent: 10,
  defaultMaxPlagiarismPercent: 5,
  defaultMaxIterations: 5,
};

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

/**
 * Minimal logger that always writes to stderr.
 *
 * MCP JSON-RPC frames must go to stdout only.
 */
export function log(level: LogLevel, message: string, extra?: unknown): void {
  const configuredIndex = LOG_LEVELS.indexOf(config.logLevel);
  const levelIndex = LOG_LEVELS.indexOf(level);

  if (levelIndex < configuredIndex) {
    return;
  }

  const prefix = `[grammarly-mcp:${level}]`;
  if (typeof extra !== "undefined") {
    console.error(prefix, message, extra);
  } else {
    console.error(prefix, message);
  }
}
