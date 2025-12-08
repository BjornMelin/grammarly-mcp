import type { AISdkClient } from "@browserbasehq/stagehand";
import type { AppConfig } from "../config";
import { log } from "../config";

export type LLMProvider = "claude-code" | "openai" | "anthropic" | "google";

/**
 * Detect which LLM provider to use based on available credentials.
 * Priority: OpenAI > Google > Anthropic > Claude Code CLI (default)
 *
 * The detection checks environment variables for explicit API keys first,
 * then checks config.claudeApiKey for Anthropic, falling back to
 * Claude Code CLI authentication when no credentials are present.
 */
export function detectLlmProvider(config: AppConfig): LLMProvider {
  // Check for explicit API keys in environment (most specific wins)
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return "google";
  }
  if (process.env.ANTHROPIC_API_KEY || config.claudeApiKey) {
    return "anthropic";
  }

  // Default to Claude Code CLI auth (no API key required)
  return "claude-code";
}

/**
 * Create a Stagehand-compatible LLM client based on detected or preferred provider.
 *
 * Note: This uses dynamic imports to support the AISdkClient from @browserbasehq/stagehand
 * and the various AI SDK providers.
 */
export async function createStagehandLlmClient(
  config: AppConfig,
  preferredProvider?: LLMProvider,
): Promise<AISdkClient> {
  const provider = preferredProvider ?? detectLlmProvider(config);

  log("debug", `Creating Stagehand LLM client with provider: ${provider}`);

  // Dynamic import to avoid bundling issues
  const { AISdkClient } = await import("@browserbasehq/stagehand");

  switch (provider) {
    case "claude-code": {
      // Primary: ai-sdk-provider-claude-code (Pro/Max subscription via CLI)
      const { claudeCode } = await import("ai-sdk-provider-claude-code");
      return new AISdkClient({ model: claudeCode("sonnet") });
    }

    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      const modelId = config.stagehandModel ?? "gpt-4o";
      return new AISdkClient({ model: openai(modelId) });
    }

    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return new AISdkClient({
        model: anthropic("claude-sonnet-4-20250514"),
      });
    }

    case "google": {
      const { google } = await import("@ai-sdk/google");
      return new AISdkClient({ model: google("gemini-2.5-flash") });
    }

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Get the model name for logging/debugging purposes.
 */
export function getLlmModelName(
  config: AppConfig,
  provider?: LLMProvider,
): string {
  const actualProvider = provider ?? detectLlmProvider(config);

  switch (actualProvider) {
    case "claude-code":
      return "claude-code/sonnet";
    case "openai":
      return config.stagehandModel ?? "gpt-4o";
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "google":
      return "gemini-2.5-flash";
    default:
      return "unknown";
  }
}
