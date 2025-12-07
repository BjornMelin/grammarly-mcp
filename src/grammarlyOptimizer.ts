import { z } from "zod";
import type { AppConfig } from "./config.js";
import { log } from "./config.js";
import {
  createBrowserUseClient,
  createGrammarlySession,
  runGrammarlyScoreTask,
  GrammarlyScores
} from "./browser/grammarlyTask.js";
import {
  analyzeTextWithClaude,
  rewriteTextWithClaude,
  summarizeOptimizationWithClaude,
  type RewriterTone
} from "./llm/claudeClient.js";

export const ToolInputSchema = z.object({
  text: z.string().min(1, "text is required"),
  mode: z
    .enum(["score_only", "optimize", "analyze"])
    .default("optimize")
    .describe("How to use Grammarly + Claude."),
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
  tone: z
    .enum(["neutral", "formal", "informal", "academic", "custom"])
    .default("neutral")
    .describe("Desired tone of the final text."),
  domain_hint: z
    .string()
    .max(200)
    .optional()
    .describe("Short description of the domain (e.g., 'university essay')."),
  custom_instructions: z
    .string()
    .max(2000)
    .optional()
    .describe("Extra constraints (e.g., preserve citations, do not change code blocks).")
});

/**
 * Zod schema for the tool output (MCP 2025-11-25 outputSchema support).
 */
export const ToolOutputSchema = z.object({
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
  history: z.array(
    z.object({
      iteration: z.number().int(),
      ai_detection_percent: z.number().nullable(),
      plagiarism_percent: z.number().nullable(),
      note: z.string()
    })
  ).describe("History of scores and notes for each iteration."),
  notes: z.string().describe("Summary or analysis notes from Claude.")
});

/**
 * Progress callback type for reporting optimization progress.
 */
export type ProgressCallback = (
  message: string,
  progress?: number
) => Promise<void>;

export type GrammarlyOptimizeMode = "score_only" | "optimize" | "analyze";

export interface GrammarlyOptimizeInput
  extends z.infer<typeof ToolInputSchema> {}

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
}

function thresholdsMet(
  scores: GrammarlyScores,
  maxAiPercent: number,
  maxPlagiarismPercent: number
): boolean {
  if (
    scores.aiDetectionPercent === null ||
    scores.plagiarismPercent === null
  ) {
    return false;
  }
  return (
    scores.aiDetectionPercent <= maxAiPercent &&
    scores.plagiarismPercent <= maxPlagiarismPercent
  );
}

/**
 * Main orchestration entrypoint for the MCP tool logic.
 *
 * @param appConfig - Application configuration
 * @param input - Tool input parameters
 * @param onProgress - Optional callback for progress notifications (MCP 2025-11-25)
 */
export async function runGrammarlyOptimization(
  appConfig: AppConfig,
  input: GrammarlyOptimizeInput,
  onProgress?: ProgressCallback
): Promise<GrammarlyOptimizeResult> {
  const {
    text,
    mode,
    max_ai_percent,
    max_plagiarism_percent,
    max_iterations,
    tone,
    domain_hint,
    custom_instructions
  } = input;

  const maxAiPercent = max_ai_percent ?? appConfig.defaultMaxAiPercent;
  const maxPlagiarismPercent =
    max_plagiarism_percent ?? appConfig.defaultMaxPlagiarismPercent;
  const maxIterations = max_iterations ?? appConfig.defaultMaxIterations;

  const history: HistoryEntry[] = [];

  let currentText = text;
  let lastScores: GrammarlyScores | null = null;
  let iterationsUsed = 0;
  let reachedThresholds = false;

  // Progress: Creating browser session
  await onProgress?.("Creating Browser Use session...", 5);

  const browserUseClient = createBrowserUseClient(appConfig);
  const sessionId = await createGrammarlySession(browserUseClient, appConfig);

  // Progress: Initial scoring
  await onProgress?.("Running initial Grammarly scoring...", 10);
  log("info", "Running initial Grammarly scoring pass");

  // Initial scoring (iteration 0).
  lastScores = await runGrammarlyScoreTask(
    browserUseClient,
    sessionId,
    currentText
  );

  history.push({
    iteration: 0,
    ai_detection_percent: lastScores.aiDetectionPercent,
    plagiarism_percent: lastScores.plagiarismPercent,
    note: "Initial Grammarly scores on original text."
  });

  if (mode === "score_only") {
    await onProgress?.("Scoring complete", 100);

    reachedThresholds = thresholdsMet(
      lastScores,
      maxAiPercent,
      maxPlagiarismPercent
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
      notes
    };
  }

  if (mode === "analyze") {
    await onProgress?.("Analyzing text with Claude...", 50);

    const analysis = await analyzeTextWithClaude(
      appConfig,
      currentText,
      lastScores.aiDetectionPercent,
      lastScores.plagiarismPercent,
      maxAiPercent,
      maxPlagiarismPercent,
      tone as RewriterTone,
      domain_hint
    );

    reachedThresholds = thresholdsMet(
      lastScores,
      maxAiPercent,
      maxPlagiarismPercent
    );

    await onProgress?.("Analysis complete", 100);

    return {
      final_text: currentText,
      ai_detection_percent: lastScores.aiDetectionPercent,
      plagiarism_percent: lastScores.plagiarismPercent,
      iterations_used: 0,
      thresholds_met: reachedThresholds,
      history,
      notes: analysis
    };
  }

  // Mode: optimize
  await onProgress?.("Starting optimization loop...", 15);
  log("info", "Starting optimization loop", {
    maxIterations,
    maxAiPercent,
    maxPlagiarismPercent
  });

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    iterationsUsed = iteration;

    // Progress: Calculate percentage (15-90% for iterations, leaving room for summary)
    const iterationProgress = 15 + ((iteration - 1) / maxIterations) * 75;
    await onProgress?.(
      `Iteration ${iteration}/${maxIterations}: Rewriting with Claude...`,
      iterationProgress
    );

    const rewriteResult = await rewriteTextWithClaude(appConfig, {
      originalText: currentText,
      lastAiPercent: lastScores.aiDetectionPercent,
      lastPlagiarismPercent: lastScores.plagiarismPercent,
      targetMaxAiPercent: maxAiPercent,
      targetMaxPlagiarismPercent: maxPlagiarismPercent,
      tone: tone as RewriterTone,
      domainHint: domain_hint,
      customInstructions: custom_instructions,
      maxIterations
    });

    currentText = rewriteResult.rewrittenText;

    // Progress: Re-scoring
    const scoringProgress = 15 + ((iteration - 0.5) / maxIterations) * 75;
    await onProgress?.(
      `Iteration ${iteration}/${maxIterations}: Re-scoring with Grammarly...`,
      scoringProgress
    );

    // Re-score the new candidate in the same session.
    lastScores = await runGrammarlyScoreTask(
      browserUseClient,
      sessionId,
      currentText
    );

    reachedThresholds = thresholdsMet(
      lastScores,
      maxAiPercent,
      maxPlagiarismPercent
    );

    history.push({
      iteration,
      ai_detection_percent: lastScores.aiDetectionPercent,
      plagiarism_percent: lastScores.plagiarismPercent,
      note: rewriteResult.reasoning
    });

    log("info", "Optimization iteration completed", {
      iteration,
      aiDetectionPercent: lastScores.aiDetectionPercent,
      plagiarismPercent: lastScores.plagiarismPercent,
      thresholdsMet: reachedThresholds
    });

    if (reachedThresholds) {
      break;
    }
  }

  // Progress: Generating summary
  await onProgress?.("Generating optimization summary...", 92);

  // Final summary via Claude (optional but useful).
  const notes = await summarizeOptimizationWithClaude(appConfig, {
    mode,
    iterationsUsed,
    thresholdsMet: reachedThresholds,
    history,
    finalText: currentText,
    maxAiPercent,
    maxPlagiarismPercent
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
    notes
  };
}
