import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";

// =============================================================================
// Environment Loading with Optional Isolation
// =============================================================================

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), ".env");
const envFileExists = fs.existsSync(envPath);
let dotenvConfig: Record<string, string> = {};
if (envFileExists) {
  // Use dotenv.parse() instead of dotenv.config() to avoid mutating process.env.
  // This preserves test isolation where tests set process.env values before import.
  const envContent = fs.readFileSync(envPath, "utf-8");
  dotenvConfig = dotenv.parse(envContent);
}

// Determine if we should ignore system env vars.
// Check process.env FIRST so tests can override .env settings.
const ignoreSystemEnv =
  (
    process.env.IGNORE_SYSTEM_ENV ?? dotenvConfig.IGNORE_SYSTEM_ENV
  )?.toLowerCase() === "true";

if (ignoreSystemEnv && !envFileExists) {
  // Warn but continue - env vars may be passed via MCP client config
  console.error(
    "[grammarly-mcp:warn] IGNORE_SYSTEM_ENV=true but no .env file found. Using process.env only.",
  );
}

// Create the effective environment: .env-only if available, otherwise process.env
const effectiveEnv =
  ignoreSystemEnv && envFileExists ? dotenvConfig : process.env;

// =============================================================================
// Type Definitions
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LLMProvider = "claude-code" | "openai" | "google" | "anthropic";
export type ClaudeModel = "auto" | "haiku" | "sonnet" | "opus";

export interface AppConfig {
  // Environment isolation
  ignoreSystemEnv: boolean;

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

  // Separate LLM provider controls
  stagehandLlmProvider: LLMProvider | undefined;
  rewriteLlmProvider: LLMProvider | undefined;

  // Claude model selection (when using claude-code provider)
  claudeModel: ClaudeModel;

  // Non-Claude model selection
  openaiModel: string;
  googleModel: string;
  anthropicModel: string;

  // API keys for LLM provider detection
  claudeApiKey: string | undefined;
  openaiApiKey: string | undefined;
  googleApiKey: string | undefined;
  anthropicApiKey: string | undefined;

  // General settings
  llmRequestTimeoutMs: number;
  connectTimeoutMs: number;
  logLevel: LogLevel;
  browserUseDefaultTimeoutMs: number;
  defaultMaxAiPercent: number;
  defaultMaxPlagiarismPercent: number;
  defaultMaxIterations: number;
}

// =============================================================================
// Zod Schema
// =============================================================================

const EnvSchema = z.object({
  // Environment isolation
  IGNORE_SYSTEM_ENV: z
    .preprocess(
      (val) => val === "true" || val === true,
      z.boolean().default(false),
    )
    .default(false),

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

  // Separate LLM provider controls
  STAGEHAND_LLM_PROVIDER: z
    .enum(["claude-code", "openai", "google", "anthropic"])
    .optional(),
  REWRITE_LLM_PROVIDER: z
    .enum(["claude-code", "openai", "google", "anthropic"])
    .optional(),

  // Claude model selection (when using claude-code provider)
  CLAUDE_MODEL: z.enum(["auto", "haiku", "sonnet", "opus"]).default("auto"),

  // Non-Claude model selection
  OPENAI_MODEL: z.string().default("gpt-4o"),
  GOOGLE_MODEL: z.string().default("gemini-2.5-flash"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // API keys
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // General settings
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CLAUDE_REQUEST_TIMEOUT_MS: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return undefined;
  }, z.number().positive().optional()),
  LLM_REQUEST_TIMEOUT_MS: z.preprocess((value) => {
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

// =============================================================================
// Validation and Config Export
// =============================================================================

const parsed = EnvSchema.safeParse(effectiveEnv);

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

// Also propagate other API keys to process.env for SDK compatibility
if (env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY ??= env.OPENAI_API_KEY;
}
if (env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??=
    env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
}
if (env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY ??= env.ANTHROPIC_API_KEY;
}

// Default thresholds; can be overridden per-tool call via args.
export const config: AppConfig = {
  // Environment isolation
  ignoreSystemEnv: env.IGNORE_SYSTEM_ENV,

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

  // Separate LLM provider controls
  stagehandLlmProvider: env.STAGEHAND_LLM_PROVIDER,
  rewriteLlmProvider: env.REWRITE_LLM_PROVIDER,

  // Claude model selection
  claudeModel: env.CLAUDE_MODEL,

  // Non-Claude model selection
  openaiModel: env.OPENAI_MODEL,
  googleModel: env.GOOGLE_MODEL,
  anthropicModel: env.ANTHROPIC_MODEL,

  // API keys for LLM provider detection
  claudeApiKey: env.CLAUDE_API_KEY,
  openaiApiKey: env.OPENAI_API_KEY,
  googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY,
  anthropicApiKey: env.ANTHROPIC_API_KEY,

  // General settings
  llmRequestTimeoutMs:
    env.LLM_REQUEST_TIMEOUT_MS ??
    env.CLAUDE_REQUEST_TIMEOUT_MS ??
    2 * 60 * 1000,
  connectTimeoutMs: env.CONNECT_TIMEOUT_MS ?? 30_000,
  logLevel: env.LOG_LEVEL,
  browserUseDefaultTimeoutMs: 5 * 60 * 1000,
  defaultMaxAiPercent: 10,
  defaultMaxPlagiarismPercent: 5,
  defaultMaxIterations: 5,
};

/**
 * Shared helper to choose an LLM provider based on available API keys.
 * Priority: OpenAI > Google > Anthropic > Claude Code (CLI auth).
 */
export function detectProviderFromApiKeys(
  configLike: Pick<
    AppConfig,
    "openaiApiKey" | "googleApiKey" | "anthropicApiKey" | "claudeApiKey"
  >,
): LLMProvider {
  if (configLike.openaiApiKey) {
    return "openai";
  }
  if (configLike.googleApiKey) {
    return "google";
  }
  if (configLike.anthropicApiKey || configLike.claudeApiKey) {
    return "anthropic";
  }
  return "claude-code";
}

// =============================================================================
// Logging
// =============================================================================

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
