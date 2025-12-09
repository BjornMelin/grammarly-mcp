import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ZodType, z } from "zod";
import {
  type BrowserProvider,
  createBrowserProvider,
  type GrammarlyScoreResult,
} from "./browser/provider";
import type { AppConfig } from "./config";
import { log } from "./config";
import {
  analyzeText,
  RewriterToneSchema,
  rewriteText,
  summarizeOptimization,
} from "./llm/rewriteClient";

export const ToolInputSchema = z.object({
  text: z.string().min(1, "text is required"),
  mode: z
    .enum(["score_only", "optimize", "analyze"])
    .default("optimize")
    .describe(
      "score_only gets scores, analyze interprets them, optimize rewrites to meet thresholds.",
    ),
  max_ai_percent: z
    .number()
    .min(0)
    .max(100)
    .default(10)
    .describe("Target maximum AI detection percentage."),
  max_plagiarism_percent: z
    .number()
    .min(0)
    .max(100)
    .default(5)
    .describe("Target maximum plagiarism percentage."),
  max_iterations: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum optimization iterations in optimize mode."),
  tone: RewriterToneSchema.default("neutral").describe(
    "Desired tone of the final text.",
  ),
  domain_hint: z
    .string()
    .max(200)
    .optional()
    .describe("Short description of the domain (e.g., 'university essay')."),
  custom_instructions: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Extra constraints (e.g., preserve citations, do not change code blocks).",
    ),
  proxy_country_code: z
    .string()
    .length(2)
    .optional()
    .describe("ISO 3166-1 alpha-2 country code for proxy (e.g., 'us', 'gb')."),
  response_format: z
    .enum(["json", "markdown"])
    .default("json")
    .describe(
      "Output format: 'json' for structured data, 'markdown' for human-readable.",
    ),
  max_steps: z
    .number()
    .int()
    .min(5)
    .max(100)
    .optional()
    .describe(
      "Maximum browser automation steps per scoring task (default 25). Prevents runaway tasks.",
    ),
});

type StructuredContent = NonNullable<CallToolResult["structuredContent"]>;

/** Zod schema for MCP 2025-11-25 structured output. */
export const ToolOutputSchema: ZodType<StructuredContent> = z.object({
  final_text: z.string().describe("The optimized or original text."),
  ai_detection_percent: z
    .number()
    .nullable()
    .describe("Final AI detection percentage from Grammarly."),
  plagiarism_percent: z
    .number()
    .nullable()
    .describe("Final plagiarism percentage from Grammarly."),
  iterations_used: z
    .number()
    .int()
    .describe("Number of optimization iterations performed."),
  thresholds_met: z
    .boolean()
    .describe("Whether the AI and plagiarism thresholds were met."),
  history: z
    .array(
      z.object({
        iteration: z.number().int(),
        ai_detection_percent: z.number().nullable(),
        plagiarism_percent: z.number().nullable(),
        note: z.string(),
      }),
    )
    .describe("History of scores and notes for each iteration."),
  notes: z.string().describe("Summary or analysis notes from Claude."),
  live_url: z
    .string()
    .nullable()
    .optional()
    .describe("Browser session debug URL."),
  provider: z
    .string()
    .optional()
    .describe("Browser automation provider used (stagehand or browser-use)."),
});

/** Callback for MCP progress notifications during optimization (0-100%). */
export type ProgressCallback = (
  message: string,
  progress?: number,
) => Promise<void>;

export type GrammarlyOptimizeMode = "score_only" | "optimize" | "analyze";

export type GrammarlyOptimizeInput = z.infer<typeof ToolInputSchema>;

export interface HistoryEntry {
  iteration: number;
  ai_detection_percent: number | null;
  plagiarism_percent: number | null;
  note: string;
}

export interface GrammarlyOptimizeResult {
  final_text: string;
  ai_detection_percent: number | null;
  plagiarism_percent: number | null;
  iterations_used: number;
  thresholds_met: boolean;
  history: HistoryEntry[];
  notes: string;
  live_url: string | null;
  provider?: string;
}

/** @internal Exported for testing */
export interface GrammarlyScores {
  aiDetectionPercent: number | null;
  plagiarismPercent: number | null;
}

// Threshold policy: require at least one available score to verify; any
// unavailable score is treated as passing its respective threshold.
/** @internal Exported for testing */
export function thresholdsMet(
  scores: GrammarlyScores,
  maxAiPercent: number,
  maxPlagiarismPercent: number,
): boolean {
  const aiAvailable = scores.aiDetectionPercent !== null;
  const plagiarismAvailable = scores.plagiarismPercent !== null;

  if (!aiAvailable && !plagiarismAvailable) {
    log("warn", "Cannot verify thresholds: both Grammarly scores unavailable");
    return false;
  }

  // Narrow nullable score fields before comparison to satisfy strict null checks.
  const aiOk =
    aiAvailable && scores.aiDetectionPercent !== null
      ? scores.aiDetectionPercent <= maxAiPercent
      : true;
  const plagiarismOk =
    plagiarismAvailable && scores.plagiarismPercent !== null
      ? scores.plagiarismPercent <= maxPlagiarismPercent
      : true;

  return aiOk && plagiarismOk;
}

/**
 * Retry utility with exponential backoff.
 * @internal Exported for testing
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; backoffMs: number; label?: string },
): Promise<T> {
  if (options.maxRetries < 0) {
    throw new RangeError("maxRetries must be non-negative");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < options.maxRetries) {
        const delay = options.backoffMs * 2 ** attempt;
        log("debug", `Retry attempt ${attempt + 1} after ${delay}ms`, {
          label: options.label,
          error:
            lastError instanceof Error
              ? lastError.message
              : String(lastError ?? "unknown error"),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (lastError === undefined) {
    throw new Error("withRetry failed without error");
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw lastError;
}

/**
 * Orchestrates scoring, analysis, or iterative optimization via browser automation
 * and Claude. Supports both Stagehand (Browserbase) and Browser Use Cloud providers.
 * Includes MCP 2025-11-25 progress notifications.
 */
export async function runGrammarlyOptimization(
  appConfig: AppConfig,
  input: GrammarlyOptimizeInput,
  onProgress?: ProgressCallback,
): Promise<GrammarlyOptimizeResult> {
  const {
    text,
    mode,
    max_ai_percent,
    max_plagiarism_percent,
    max_iterations,
    tone,
    domain_hint,
    custom_instructions,
    proxy_country_code,
    max_steps,
  } = input;

  const history: HistoryEntry[] = [];

  let currentText = text;
  let lastScores: GrammarlyScoreResult | null = null;
  let iterationsUsed = 0;
  let reachedThresholds = false;

  // Progress: Creating browser session
  const providerName = appConfig.browserProvider;
  await onProgress?.(
    `Creating ${providerName === "stagehand" ? "Stagehand" : "Browser Use"} session...`,
    5,
  );

  // Create provider based on configuration
  let provider: BrowserProvider | undefined;
  let sessionId: string | null = null;
  let liveUrl: string | null = null;

  try {
    // Create provider with retry logic
    provider = await withRetry(() => createBrowserProvider(appConfig), {
      maxRetries: 2,
      backoffMs: 1000,
      label: "createProvider",
    });

    // Capture provider as a const for use in closures (TypeScript narrowing)
    const activeProvider = provider;

    log("info", `Using browser provider: ${activeProvider.providerName}`);

    // Create session with retry logic
    const sessionResult = await withRetry(
      () =>
        activeProvider.createSession({
          proxyCountryCode: proxy_country_code,
        }),
      { maxRetries: 3, backoffMs: 1000, label: "createSession" },
    );

    sessionId = sessionResult.sessionId;
    liveUrl = sessionResult.liveUrl;

    log("info", "Browser session created", {
      sessionId,
      liveUrl,
      provider: activeProvider.providerName,
    });

    // Capture sessionId as a const for use in closures (TypeScript narrowing)
    const activeSessionId = sessionId;

    // Progress: Initial scoring
    await onProgress?.("Running initial Grammarly scoring...", 10);
    log("info", "Running initial Grammarly scoring pass");

    // Baseline scoring (iteration 0 before optimization loop) with retry
    lastScores = await withRetry(
      () =>
        activeProvider.scoreText(activeSessionId, currentText, {
          maxSteps: max_steps,
          iteration: 0,
          mode,
          flashMode: mode === "score_only",
        }),
      { maxRetries: 2, backoffMs: 2000, label: "initialScore" },
    );

    history.push({
      iteration: 0,
      ai_detection_percent: lastScores.aiDetectionPercent,
      plagiarism_percent: lastScores.plagiarismPercent,
      note: "Baseline Grammarly scores on original text (iteration 0).",
    });

    if (mode === "score_only") {
      await onProgress?.("Scoring complete", 100);

      reachedThresholds = thresholdsMet(
        lastScores,
        max_ai_percent,
        max_plagiarism_percent,
      );

      const notes = reachedThresholds
        ? "Score-only run: original text already meets configured AI and plagiarism thresholds."
        : "Score-only run: thresholds not met or scores unavailable; no rewriting performed.";

      return {
        final_text: currentText,
        ai_detection_percent: lastScores.aiDetectionPercent,
        plagiarism_percent: lastScores.plagiarismPercent,
        iterations_used: 0,
        thresholds_met: reachedThresholds,
        history,
        notes,
        live_url: liveUrl,
        provider: activeProvider.providerName,
      };
    }

    if (mode === "analyze") {
      await onProgress?.("Analyzing text with Claude...", 50);

      const analysis = await analyzeText(
        appConfig,
        currentText,
        lastScores.aiDetectionPercent,
        lastScores.plagiarismPercent,
        max_ai_percent,
        max_plagiarism_percent,
        tone,
        domain_hint,
      );

      reachedThresholds = thresholdsMet(
        lastScores,
        max_ai_percent,
        max_plagiarism_percent,
      );

      await onProgress?.("Analysis complete", 100);

      return {
        final_text: currentText,
        ai_detection_percent: lastScores.aiDetectionPercent,
        plagiarism_percent: lastScores.plagiarismPercent,
        iterations_used: 0,
        thresholds_met: reachedThresholds,
        history,
        notes: analysis,
        live_url: liveUrl,
        provider: activeProvider.providerName,
      };
    }

    // Mode: optimize
    await onProgress?.("Starting optimization loop...", 15);
    log("info", "Starting optimization loop", {
      max_iterations,
      max_ai_percent,
      max_plagiarism_percent,
    });

    for (let iteration = 1; iteration <= max_iterations; iteration += 1) {
      iterationsUsed = iteration;

      // Progress is iteration-based (not wall clock): 15–85% reserved for loop.
      const iterationProgress = Math.max(
        15,
        Math.min(85, 15 + ((iteration - 1) / max_iterations) * 70),
      );
      await onProgress?.(
        `Iteration ${iteration}/${max_iterations}: Rewriting with Claude...`,
        iterationProgress,
      );

      const rewriteResult = await rewriteText(appConfig, {
        originalText: currentText,
        lastAiPercent: lastScores.aiDetectionPercent,
        lastPlagiarismPercent: lastScores.plagiarismPercent,
        targetMaxAiPercent: max_ai_percent,
        targetMaxPlagiarismPercent: max_plagiarism_percent,
        tone,
        domainHint: domain_hint,
        customInstructions: custom_instructions,
        maxIterations: max_iterations,
      });

      currentText = rewriteResult.rewrittenText;

      // Progress: Re-scoring for this iteration.
      const scoringProgress = Math.max(
        15,
        Math.min(85, 15 + ((iteration - 1 + 0.5) / max_iterations) * 70),
      );
      await onProgress?.(
        `Iteration ${iteration}/${max_iterations}: Re-scoring with Grammarly...`,
        scoringProgress,
      );

      // Re-score the new candidate with retry logic
      lastScores = await withRetry(
        () =>
          activeProvider.scoreText(activeSessionId, currentText, {
            maxSteps: max_steps,
            iteration,
            mode,
            flashMode: false,
          }),
        {
          maxRetries: 2,
          backoffMs: 2000,
          label: `score-iteration-${iteration}`,
        },
      );

      reachedThresholds = thresholdsMet(
        lastScores,
        max_ai_percent,
        max_plagiarism_percent,
      );

      history.push({
        iteration,
        ai_detection_percent: lastScores.aiDetectionPercent,
        plagiarism_percent: lastScores.plagiarismPercent,
        note: rewriteResult.reasoning,
      });

      log("info", "Optimization iteration completed", {
        iteration,
        aiDetectionPercent: lastScores.aiDetectionPercent,
        plagiarismPercent: lastScores.plagiarismPercent,
        thresholdsMet: reachedThresholds,
      });

      if (reachedThresholds) {
        break;
      }
    }

    // Progress: Generating summary
    await onProgress?.("Generating optimization summary...", 92);

    // Final summary via LLM (optional but useful).
    const notes = await summarizeOptimization(appConfig, {
      mode,
      iterationsUsed,
      thresholdsMet: reachedThresholds,
      history,
      finalText: currentText,
      maxAiPercent: max_ai_percent,
      maxPlagiarismPercent: max_plagiarism_percent,
    });

    // Progress: Complete
    await onProgress?.("Optimization complete", 100);

    return {
      final_text: currentText,
      ai_detection_percent: lastScores.aiDetectionPercent,
      plagiarism_percent: lastScores.plagiarismPercent,
      iterations_used: iterationsUsed,
      thresholds_met: reachedThresholds,
      history,
      notes,
      live_url: liveUrl,
      provider: activeProvider.providerName,
    };
  } finally {
    // Cleanup session
    if (sessionId && provider) {
      try {
        await provider.closeSession(sessionId);
        log("debug", "Browser session closed", { sessionId });
      } catch (error) {
        log("warn", "Failed to close browser session", {
          sessionId,
          error,
        });
      }
    }
  }
}
