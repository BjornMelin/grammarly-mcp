import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { AppConfig, ClaudeModel, LLMProvider } from "../config";
import { detectProviderFromApiKeys, log } from "../config";

export const RewriterToneSchema = z.enum([
  "neutral",
  "formal",
  "informal",
  "academic",
  "custom",
]);
export type RewriterTone = z.infer<typeof RewriterToneSchema>;

export type RewriteProvider = LLMProvider;

export interface RewriteParams {
  originalText: string;
  lastAiPercent: number | null;
  lastPlagiarismPercent: number | null;
  targetMaxAiPercent: number;
  targetMaxPlagiarismPercent: number;
  tone: RewriterTone;
  domainHint?: string;
  customInstructions?: string;
  maxIterations: number;
}

export interface RewriteResult {
  rewrittenText: string;
  reasoning: string;
}

const RewriteSchema = z.object({
  rewrittenText: z.string().describe("The full rewritten text."),
  reasoning: z
    .string()
    .describe(
      "Short explanation of modifications and strategies used to reduce AI and plagiarism scores.",
    ),
});

const AnalysisSchema = z.object({
  analysis: z
    .string()
    .describe(
      "Concise analysis of AI detection and plagiarism risk and suggestions for improvement.",
    ),
});

/**
 * Detect which LLM provider to use for rewriting based on config.
 * Priority: explicit REWRITE_LLM_PROVIDER > API key detection > claude-code
 */
export function detectRewriteProvider(config: AppConfig): RewriteProvider {
  if (config.rewriteLlmProvider) {
    return config.rewriteLlmProvider;
  }
  return detectProviderFromApiKeys(config);
}

/**
 * Choose Claude model based on text length and iteration count.
 * @internal Exported for testing
 */
export function chooseClaudeModel(
  textLength: number,
  maxIterations: number,
  forcedModel?: ClaudeModel,
): "haiku" | "sonnet" | "opus" {
  if (forcedModel && forcedModel !== "auto") {
    return forcedModel;
  }
  // Heuristic: prefer opus for very long texts or high iteration counts.
  // 12k characters ≈ 8–9k tokens, where opus maintains quality and longer context.
  // >8 iterations implies heavier rewrite loops; opus reduces retries and instability.
  if (textLength > 12000 || maxIterations > 8) {
    return "opus";
  }
  // Haiku: cost optimization for short texts with few iterations.
  // <3k characters is typically 1-2k tokens; ≤3 iterations is light rewrite work.
  if (textLength < 3000 && maxIterations <= 3) {
    return "haiku";
  }
  // Sonnet: default for moderate complexity.
  return "sonnet";
}

/**
 * Get the appropriate model instance based on provider and config.
 */
async function getRewriteModel(
  config: AppConfig,
  provider: RewriteProvider,
  textLength = 0,
  maxIterations = 5,
) {
  switch (provider) {
    case "claude-code": {
      const { claudeCode } = await import("ai-sdk-provider-claude-code");
      const modelId = chooseClaudeModel(
        textLength,
        maxIterations,
        config.claudeModel,
      );
      return { model: claudeCode(modelId), modelId: `claude-code/${modelId}` };
    }
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return { model: openai(config.openaiModel), modelId: config.openaiModel };
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return { model: google(config.googleModel), modelId: config.googleModel };
    }
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const modelId = config.anthropicModel;
      return { model: anthropic(modelId), modelId };
    }
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unknown rewrite provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Log which authentication method will be used.
 */
function logAuthMethod(provider: RewriteProvider, apiKey?: string): void {
  if (provider === "claude-code") {
    if (apiKey) {
      log("debug", "Using Claude API key authentication");
    } else {
      log(
        "debug",
        "Using Claude CLI authentication (Pro/Max subscription via 'claude login')",
      );
    }
  } else {
    log("debug", `Using ${provider} provider`);
  }
}

/** Rewrite text with the configured provider to reduce AI detection and plagiarism. */
export async function rewriteText(
  appConfig: AppConfig,
  params: RewriteParams,
): Promise<RewriteResult> {
  const {
    originalText,
    lastAiPercent,
    lastPlagiarismPercent,
    targetMaxAiPercent,
    targetMaxPlagiarismPercent,
    tone,
    domainHint,
    customInstructions,
    maxIterations,
  } = params;

  const provider = detectRewriteProvider(appConfig);
  logAuthMethod(provider, appConfig.claudeApiKey);

  const { model, modelId } = await getRewriteModel(
    appConfig,
    provider,
    originalText.length,
    maxIterations,
  );

  // Use "an" for tones starting with a vowel sound (informal, academic)
  const article = /^[aeiou]/i.test(tone) ? "an" : "a";
  const toneDescription =
    tone === "custom"
      ? "Use a natural human tone guided by the custom instructions."
      : `Use ${article} ${tone} tone that feels like a human wrote it.`;

  const domainText = domainHint ? `Domain: ${domainHint.trim()}.\n` : "";

  const lastAiText =
    lastAiPercent === null
      ? "The last AI detection score was unavailable."
      : `The last AI detection score from Grammarly was approximately ${lastAiPercent}%.`;

  const lastPlagiarismText =
    lastPlagiarismPercent === null
      ? "The last plagiarism / originality score was unavailable."
      : `The last plagiarism score from Grammarly was approximately ${lastPlagiarismPercent}%.`;

  const targetText = [
    `Target: AI detection ≤ ${targetMaxAiPercent}%`,
    `Target: plagiarism ≤ ${targetMaxPlagiarismPercent}%`,
  ].join(", ");

  const customText = customInstructions
    ? `Additional constraints from the user: ${customInstructions.trim()}`
    : "No additional custom constraints were provided.";

  const prompt = [
    "You are an expert human-writing optimizer.",
    "You rewrite text so that:",
    "- It reads as naturally human as possible.",
    "- It avoids obvious AI-writing patterns: template-like phrasing, overuse of buzzwords,",
    "  repetitive sentence openings, or exaggerated enthusiasm.",
    "- It preserves all important factual content and structure.",
    "- It avoids copying long phrases from common AI models or from Grammarly's own rewrite style.",
    "- It adapts the writing to feel personal and aligned with the author's intent and audience.",
    "",
    "Context:",
    domainText,
    lastAiText,
    lastPlagiarismText,
    `${targetText}.`,
    "",
    toneDescription,
    customText,
    "",
    "Do NOT:",
    "- Add citations or references that do not exist in the original.",
    "- Fabricate sources or numeric data.",
    "- Change code blocks, inline code, or math expressions other than trivial formatting.",
    "- Use em dashes (—) or emojis in the rewritten text.",
    "Examples of what NOT to change:",
    "- Code block (delimited by triple backticks):",
    "  ```js",
    "  const x = 5;",
    "  ```",
    "- Inline code (single backticks): `const x = 5;`",
    "- Math expression (e.g., $E=mc^2$ or \\\\(\\int_0^1 x^2 dx\\\\)).",
    "",
    "When you rewrite:",
    "- Prefer varied sentence lengths.",
    "- Occasionally use short, direct sentences.",
    "- Remove filler phrases like 'in today's world', 'in conclusion', and similar clichés,",
    "  unless they are essential to the content.",
    "- Make the text sound like a specific human author wrote it for a specific audience,",
    "  not like a generic AI assistant voice.",
    "",
    "Return strictly in the JSON schema you were given.",
    "",
    "Original text:",
    "-----",
    originalText,
    "-----",
  ].join("\n");

  const timeoutMs = appConfig.llmRequestTimeoutMs;
  log("info", "Calling for rewrite", { provider, modelId });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      generateObject({
        model,
        schema: RewriteSchema,
        prompt,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          log("error", "Rewrite timed out", {
            provider,
            modelId,
            timeoutMs,
            promptPreview: prompt.slice(0, 500),
          });
          reject(
            new Error(`Rewrite request exceeded timeout of ${timeoutMs}ms`),
          );
        }, timeoutMs);
      }),
    ]);

    const object = result.object;

    log("debug", "Rewrite completed", { provider, modelId });
    return {
      rewrittenText: object.rewrittenText,
      reasoning: object.reasoning,
    };
  } catch (error: unknown) {
    log("error", "Rewrite failed", { provider, modelId, error });
    throw new Error(
      `Rewrite failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/** Analyze text for AI detection and plagiarism risk. */
export async function analyzeText(
  appConfig: AppConfig,
  text: string,
  aiPercent: number | null,
  plagiarismPercent: number | null,
  targetMaxAiPercent: number,
  targetMaxPlagiarismPercent: number,
  tone: RewriterTone,
  domainHint?: string,
): Promise<string> {
  const provider = detectRewriteProvider(appConfig);
  logAuthMethod(provider, appConfig.claudeApiKey);

  const { model, modelId } = await getRewriteModel(
    appConfig,
    provider,
    text.length,
    1,
  );

  const aiText =
    aiPercent === null
      ? "Current Grammarly AI detection score is unknown (not available)."
      : `Current Grammarly AI detection score is approximately ${aiPercent}%.`;

  const plagText =
    plagiarismPercent === null
      ? "Current Grammarly plagiarism / originality score is unknown (not available)."
      : `Current Grammarly plagiarism / originality score is approximately ${plagiarismPercent}%.`;

  const targetText = [
    `Target AI detection ≤ ${targetMaxAiPercent}%`,
    `Target plagiarism ≤ ${targetMaxPlagiarismPercent}%`,
  ].join(", ");

  const domainText = domainHint
    ? `Domain: ${domainHint.trim()}`
    : "Domain not specified.";

  const prompt = [
    "You are analyzing a piece of text for the risk of being flagged by Grammarly's AI Detector",
    "and Plagiarism Checker.",
    "",
    aiText,
    plagText,
    `${targetText}.`,
    domainText,
    `Desired tone: ${tone}.`,
    "",
    "Tasks:",
    "1. Briefly assess how likely this text is to be flagged as AI-generated by a typical detector.",
    "2. Briefly assess plagiarism risk given the score (if available).",
    "3. Suggest 3-5 specific, concrete changes that would make the text feel more human-written",
    "   while preserving the meaning.",
    "4. Call out any obviously AI-ish phrases or structures to avoid.",
    "5. Note whether the text sounds like a specific human author or like a generic AI assistant.",
    "",
    "Respond with a few short paragraphs and bullet points, suitable for showing directly to a user.",
    "Return strictly in the JSON schema you were given.",
    "",
    "Text to analyze:",
    "-----",
    text,
    "-----",
  ].join("\n");

  log("info", "Calling for analysis", { provider, modelId });

  const timeoutMs = appConfig.llmRequestTimeoutMs;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      generateObject({
        model,
        schema: AnalysisSchema,
        prompt,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          log("error", "Analysis timed out", {
            provider,
            modelId,
            timeoutMs,
            promptPreview: prompt.slice(0, 500),
          });
          reject(
            new Error(`Analysis request exceeded timeout of ${timeoutMs}ms`),
          );
        }, timeoutMs);
      }),
    ]);

    return result.object.analysis;
  } catch (error: unknown) {
    log("error", "Analysis failed", { provider, modelId, error });
    throw new Error(
      `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/** Generate a user-facing summary of the optimization run. */
export async function summarizeOptimization(
  appConfig: AppConfig,
  summaryInput: {
    mode: "score_only" | "optimize" | "analyze";
    iterationsUsed: number;
    thresholdsMet: boolean;
    history: Array<{
      iteration: number;
      ai_detection_percent: number | null;
      plagiarism_percent: number | null;
      note: string;
    }>;
    finalText: string;
    maxAiPercent: number;
    maxPlagiarismPercent: number;
  },
): Promise<string> {
  const provider = detectRewriteProvider(appConfig);
  logAuthMethod(provider, appConfig.claudeApiKey);

  const { model, modelId } = await getRewriteModel(
    appConfig,
    provider,
    summaryInput.finalText.length,
    1,
  );

  const timeoutMs = appConfig.llmRequestTimeoutMs;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const prompt = [
    "You are summarizing the outcome of a Grammarly-based AI detection and plagiarism optimization run.",
    "",
    `Mode: ${summaryInput.mode}`,
    `Iterations used (excluding initial scoring at iteration 0): ${summaryInput.iterationsUsed}`,
    `Thresholds met: ${summaryInput.thresholdsMet}`,
    `Targets: AI ≤ ${summaryInput.maxAiPercent}%, plagiarism ≤ ${summaryInput.maxPlagiarismPercent}%`,
    "",
    "History entries:",
    JSON.stringify(summaryInput.history, null, 2),
    "",
    "Final text (for context only, do not quote large passages):",
    "-----",
    summaryInput.finalText.slice(0, 4000),
    "-----",
    "",
    "Produce a short summary with:",
    "- A one-line verdict of how safe the text is with respect to AI and plagiarism detection.",
    "- A bullet list of the most important changes made across iterations.",
    "- A note if scores are missing or thresholds were not met.",
    "",
    "Keep the response under 250 words.",
  ].join("\n");

  log("debug", "Calling for optimization summary", { provider, modelId });

  try {
    const result = await Promise.race([
      generateText({
        model,
        prompt,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          log("error", "Optimization summary timed out", {
            provider,
            modelId,
            timeoutMs,
            promptPreview: prompt.slice(0, 500),
          });
          reject(
            new Error(
              `Optimization summary request exceeded timeout of ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);

    return result.text;
  } catch (error: unknown) {
    log("error", "Summary failed", { provider, modelId, error });
    throw new Error(
      `Optimization summary failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
