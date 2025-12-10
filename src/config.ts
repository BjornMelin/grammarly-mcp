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

// Create the effective environment: when ignoring system envs, use .env only;
// otherwise merge .env (if present) with process.env so .env values fill gaps
// without overwriting explicit system envs (mirrors dotenv.config semantics).
const effectiveEnv =
  ignoreSystemEnv && envFileExists
    ? dotenvConfig
    : { ...dotenvConfig, ...process.env };

// =============================================================================
// Type Definitions
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LLMProvider = "claude-code" | "openai" | "google" | "anthropic";
export type ClaudeModel = "auto" | "haiku" | "sonnet" | "opus";
export type StealthLevel = "none" | "basic" | "advanced";

// =============================================================================
// Proxy and Stealth Configuration Schemas
// =============================================================================

/**
 * Regex validation only - Browserbase supports 201 countries, delegate full validation to API.
 */
const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/i, "Must be ISO 3166-1 alpha-2 code")
  .transform((v) => v.toUpperCase())
  .optional();

/**
 * Proxy type: Browserbase built-in or external (BYOP).
 */
export const ProxyTypeSchema = z
  .enum(["browserbase", "external"])
  .default("browserbase");

/**
 * IPRoyal sticky session ID format: 8 alphanumeric characters.
 */
const SessionIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{8}$/, "Must be 8 alphanumeric characters")
  .optional();

/**
 * IPRoyal session lifetime format: number + unit (s/m/h/d).
 * Examples: "10m", "1h", "30s", "1d"
 */
const SessionLifetimeSchema = z
  .string()
  .regex(/^\d+[smhd]$/, "Must be number + unit (s/m/h/d)")
  .optional();

/**
 * Proxy configuration for Browserbase sessions.
 * Supports both built-in Browserbase proxies and external (BYOP) proxies.
 * @example Built-in: { "enabled": true, "country": "US" }
 * @example External: { "type": "external", "server": "http://geo.iproyal.com:12321", "username": "user", "password": "pass" }
 */
export const ProxyConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    country: CountryCodeSchema,
    region: z.string().optional(),

    // === BYOP (Bring Your Own Proxy) fields ===
    /** Proxy type: "browserbase" (default) | "external" */
    type: ProxyTypeSchema,
    /** External proxy server URL, e.g., "http://geo.iproyal.com:12321" */
    server: z.string().url().optional(),
    /** Proxy authentication username */
    username: z.string().optional(),
    /** Proxy authentication password (can include IPRoyal session params) */
    password: z.string().optional(),

    // === IPRoyal-specific session config ===
    /** Sticky session ID (8 alphanumeric chars) for same IP across requests */
    sessionId: SessionIdSchema,
    /** Session lifetime for sticky IPs: "10m", "1h", "1d" etc */
    sessionLifetime: SessionLifetimeSchema,
  })
  .refine(
    (data) =>
      data.type !== "external" ||
      (data.server && data.username && data.password),
    { message: "External proxy requires server, username, and password" },
  );

/**
 * Stealth configuration for Browserbase sessions.
 * Uses abstraction levels with optional direct overrides for power users.
 * @example { "level": "advanced", "viewport": "1920x1080" }
 */
export const StealthConfigSchema = z.object({
  level: z.enum(["none", "basic", "advanced"]).default("basic"),
  // Optional direct overrides (bypass level abstraction)
  blockAds: z.boolean().optional(),
  solveCaptchas: z.boolean().optional(),
  viewport: z
    .string()
    .regex(/^\d+x\d+$/, "Must be WIDTHxHEIGHT format")
    .optional(),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type StealthConfig = z.infer<typeof StealthConfigSchema>;

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

  // Proxy and stealth configuration (from JSON env vars)
  proxyConfig: ProxyConfig | null;
  stealthConfig: StealthConfig | null;
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

  // Proxy and stealth configuration (JSON strings)
  PROXY_CONFIG: z.string().optional(),
  STEALTH_CONFIG: z.string().optional(),

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

// Parse proxy and stealth configuration from JSON env vars.
// We need a forward declaration for the log function since config isn't initialized yet.
// Use console.error directly for early-stage parsing errors.
function parseJsonConfigEarly<T>(
  value: string | undefined,
  schema: z.ZodType<T>,
  name: string,
): T | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error(
        `[grammarly-mcp:warn] Invalid ${name} JSON; using defaults`,
        JSON.stringify(result.error.format()),
      );
      return null;
    }
    return result.data;
  } catch {
    console.error(
      `[grammarly-mcp:warn] Failed to parse ${name} as JSON; disabling`,
    );
    return null;
  }
}

const parsedProxyConfig = parseJsonConfigEarly(
  env.PROXY_CONFIG,
  ProxyConfigSchema,
  "PROXY_CONFIG",
) as ProxyConfig | null;
const parsedStealthConfig = parseJsonConfigEarly(
  env.STEALTH_CONFIG,
  StealthConfigSchema,
  "STEALTH_CONFIG",
) as StealthConfig | null;

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

  // Proxy and stealth configuration (parsed from JSON env vars)
  proxyConfig: parsedProxyConfig,
  stealthConfig: parsedStealthConfig,
};

// Startup logging for proxy/stealth config
if (config.proxyConfig?.country) {
  console.error(
    `[grammarly-mcp:info] Proxy configured: ${config.proxyConfig.country} (+$0.01/GB)`,
  );
}
if (config.stealthConfig) {
  console.error(
    `[grammarly-mcp:info] Stealth level: ${config.stealthConfig.level}`,
  );
}

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

// =============================================================================
// Proxy and Stealth Configuration Helpers
// =============================================================================

/**
 * Build IPRoyal-compatible password with session parameters.
 * Format: password_country-XX_session-XXXXXXXX_lifetime-Xm
 *
 * @example
 * buildIproyalPassword("mypass", { country: "US" })
 * // Returns: "mypass_country-us"
 *
 * @example
 * buildIproyalPassword("mypass", { country: "US", sessionId: "abc12345", sessionLifetime: "30m" })
 * // Returns: "mypass_country-us_session-abc12345_lifetime-30m"
 */
export function buildIproyalPassword(
  basePassword: string,
  options?: {
    country?: string;
    sessionId?: string;
    sessionLifetime?: string;
  },
): string {
  const parts = [basePassword];
  if (options?.country) {
    parts.push(`country-${options.country.toLowerCase()}`);
  }
  if (options?.sessionId) {
    parts.push(`session-${options.sessionId}`);
  }
  if (options?.sessionLifetime) {
    parts.push(`lifetime-${options.sessionLifetime}`);
  }
  return parts.join("_");
}

/**
 * Parse a JSON string into a validated config object.
 * Returns null if the value is undefined, empty, or invalid JSON.
 */
export function parseJsonConfig<T>(
  value: string | undefined,
  schema: z.ZodType<T>,
  name: string,
): T | null {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      log(
        "warn",
        `Invalid ${name} JSON; using defaults`,
        result.error.format(),
      );
      return null;
    }
    return result.data;
  } catch {
    log("warn", `Failed to parse ${name} as JSON; disabling`);
    return null;
  }
}

// Realistic desktop viewports for stealth randomization
const DEFAULT_VIEWPORTS = [
  "1366x768",
  "1920x1080",
  "1536x864",
  "1440x900",
  "1280x720",
];

// Stealth level mappings (abstraction layer)
const STEALTH_LEVEL_DEFAULTS = {
  none: { advancedStealth: false, blockAds: false, solveCaptchas: false },
  basic: { advancedStealth: false, blockAds: true, solveCaptchas: true },
  advanced: { advancedStealth: true, blockAds: true, solveCaptchas: true },
} as const;

/**
 * Browser session options for Browserbase.
 */
export interface BrowserSessionOptions {
  stealth: boolean;
  advancedStealth: boolean;
  blockAds: boolean;
  solveCaptchas: boolean;
  viewport?: { width: number; height: number };
  proxyCountry?: string;
  proxyEnabled: boolean;

  // === BYOP (Bring Your Own Proxy) fields ===
  /** Proxy type: "browserbase" (default) | "external" */
  proxyType?: "browserbase" | "external";
  /** External proxy server URL */
  proxyServer?: string;
  /** Proxy authentication username */
  proxyUsername?: string;
  /** Proxy authentication password (with IPRoyal params built in) */
  proxyPassword?: string;
}

/**
 * Build session options from environment configuration.
 * Proxy and stealth settings are configured via PROXY_CONFIG and STEALTH_CONFIG env vars.
 */
export function getSessionOptions(appConfig: AppConfig): BrowserSessionOptions {
  const proxy = appConfig.proxyConfig;
  const stealth = appConfig.stealthConfig;

  // Normalize proxy country (uppercase for Browserbase API)
  const proxyCountry = proxy?.country?.toUpperCase();
  // No static list validation - Browserbase supports 201 countries, let API validate

  // Get stealth level defaults, then apply optional overrides
  const level = stealth?.level ?? "basic";
  const levelDefaults = STEALTH_LEVEL_DEFAULTS[level];

  // Parse explicit viewport or randomize for advanced stealth
  let viewport: { width: number; height: number } | undefined;
  const vpStr = stealth?.viewport;
  if (vpStr) {
    const [w, h] = vpStr.split("x").map(Number);
    if (w && h) {
      viewport = { width: w, height: h };
    }
  } else if (level === "advanced") {
    // Random viewport for advanced stealth (only if not explicitly set)
    // DEFAULT_VIEWPORTS is a non-empty, hard-coded array of valid "WxH" strings,
    // so the random selection is always valid, split() produces exactly 2 elements,
    // and Number() conversion is guaranteed to produce numeric values.
    const randomVp = DEFAULT_VIEWPORTS[
      Math.floor(Math.random() * DEFAULT_VIEWPORTS.length)
    ] as string;
    const [w, h] = randomVp.split("x").map(Number) as [number, number];
    viewport = { width: w, height: h };
  }

  // Build IPRoyal password with session parameters if needed
  let proxyPassword: string | undefined;
  if (proxy?.password) {
    // Only apply IPRoyal formatting if password doesn't already contain params
    if (
      proxy.password.includes("_country-") ||
      proxy.password.includes("_session-") ||
      proxy.password.includes("_lifetime-")
    ) {
      // Password already has IPRoyal params - use as-is
      proxyPassword = proxy.password;
    } else {
      // Build IPRoyal password with optional session parameters
      proxyPassword = buildIproyalPassword(proxy.password, {
        country: proxy.country,
        sessionId: proxy.sessionId,
        sessionLifetime: proxy.sessionLifetime,
      });
    }
  }

  // Determine proxy enablement based on type
  // For external proxies: enabled if server is set
  // For browserbase proxies: enabled if country is set
  const isExternalProxy = proxy?.type === "external";
  const proxyEnabled =
    proxy?.enabled !== false &&
    (isExternalProxy ? !!proxy?.server : !!proxyCountry);

  return {
    stealth: level !== "none",
    advancedStealth: levelDefaults.advancedStealth,
    blockAds: stealth?.blockAds ?? levelDefaults.blockAds,
    solveCaptchas: stealth?.solveCaptchas ?? levelDefaults.solveCaptchas,
    viewport,
    proxyCountry,
    proxyEnabled,

    // BYOP fields
    proxyType: proxy?.type,
    proxyServer: proxy?.server,
    proxyUsername: proxy?.username,
    proxyPassword,
  };
}
