import { z } from "zod";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  browserUseApiKey: string;
  browserUseProfileId: string;
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
  BROWSER_USE_API_KEY: z
    .string()
    .min(1, "BROWSER_USE_API_KEY is required for Browser Use Cloud"),
  BROWSER_USE_PROFILE_ID: z
    .string()
    .min(1, "BROWSER_USE_PROFILE_ID is required for Grammarly profile"),
  // Optional: when not provided, Claude Code uses CLI auth ('claude login')
  // which works with Claude Pro/Max subscriptions
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

// Claude SDK reads API keys from environment variables at call time.
// If an API key is provided, set it for downstream SDK calls.
// If not provided, Claude Code uses CLI authentication ('claude login').
if (env.CLAUDE_API_KEY) {
  process.env.CLAUDE_API_KEY ??= env.CLAUDE_API_KEY;
  process.env.ANTHROPIC_API_KEY ??= env.CLAUDE_API_KEY;
}

// Default thresholds; can be overridden per-tool call via args.
export const config: AppConfig = {
  browserUseApiKey: env.BROWSER_USE_API_KEY,
  browserUseProfileId: env.BROWSER_USE_PROFILE_ID,
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
