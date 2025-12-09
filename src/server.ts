#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config, log } from "./config";
import {
  type GrammarlyOptimizeInput,
  type GrammarlyOptimizeResult,
  type ProgressCallback,
  runGrammarlyOptimization,
  ToolInputSchema,
  ToolOutputSchema,
} from "./grammarlyOptimizer";

/**
 * Format optimization result as human-readable markdown.
 */
export function formatAsMarkdown(result: GrammarlyOptimizeResult): string {
  const statusEmoji = result.thresholds_met ? "✅" : "⚠️";
  const aiScore =
    result.ai_detection_percent !== null
      ? `${result.ai_detection_percent}%`
      : "N/A";
  const plagiarismScore =
    result.plagiarism_percent !== null
      ? `${result.plagiarism_percent}%`
      : "N/A";

  const lines: string[] = [
    `# Grammarly Optimization Result ${statusEmoji}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| AI Detection | ${aiScore} |`,
    `| Plagiarism | ${plagiarismScore} |`,
    `| Thresholds Met | ${result.thresholds_met ? "Yes" : "No"} |`,
    `| Iterations Used | ${result.iterations_used} |`,
  ];

  if (result.live_url) {
    lines.push(`| Live Preview | [Browser Session](${result.live_url}) |`);
  }

  lines.push("", "## Notes", "", result.notes);

  if (result.history.length > 0) {
    lines.push("", "## Iteration History", "");
    lines.push("| Iteration | AI % | Plagiarism % | Note |");
    lines.push("|-----------|------|--------------|------|");
    for (const entry of result.history) {
      const ai =
        entry.ai_detection_percent !== null
          ? `${entry.ai_detection_percent}%`
          : "N/A";
      const plag =
        entry.plagiarism_percent !== null
          ? `${entry.plagiarism_percent}%`
          : "N/A";
      // Truncate long notes for table readability
      const note =
        entry.note.length > 60 ? `${entry.note.slice(0, 57)}...` : entry.note;
      lines.push(`| ${entry.iteration} | ${ai} | ${plag} | ${note} |`);
    }
  }

  lines.push(
    "",
    "---",
    "",
    "## Final Text",
    "",
    "```",
    result.final_text,
    "```",
  );

  return lines.join("\n");
}

/**
 * Create and configure the MCP server.
 *
 * This server implements MCP specification 2025-11-25 with:
 * - registerTool() API (replaces deprecated tool())
 * - Tool annotations for client hints
 * - Output schema for structured responses
 * - Tasks support for async operations (experimental)
 * - Progress notifications during long operations
 */
async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: "grammarly-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    "grammarly_optimize_text",
    {
      title: "Grammarly Text Optimizer",
      description:
        "Get AI detection and plagiarism scores from Grammarly, optionally rewriting text with the configured LLM to reduce scores. " +
        "Modes: 'score_only' (scores only), 'analyze' (scores + recommendations), 'optimize' (iterative rewriting to meet thresholds).",
      inputSchema: ToolInputSchema,
      outputSchema: ToolOutputSchema,
      annotations: {
        readOnlyHint: false, // Tool can rewrite text
        destructiveHint: false, // Non-destructive (original preserved in input)
        idempotentHint: false, // Each run may produce different results
        openWorldHint: true, // Interacts with Grammarly and external LLM APIs
      },
    },
    async (args, extra) => {
      const parsed = ToolInputSchema.parse(args) as GrammarlyOptimizeInput;

      log("info", "Received grammarly_optimize_text tool call", {
        mode: parsed.mode,
        max_ai_percent: parsed.max_ai_percent,
        max_plagiarism_percent: parsed.max_plagiarism_percent,
        max_iterations: parsed.max_iterations,
      });

      // Create progress callback for MCP progress notifications.
      // Prefer a public accessor if available (MCP SDK >=1.25.x expected to expose a getter;
      // see README), and only fall back to the private `_meta` escape hatch when nothing
      // else exists.
      // Allow either the public getter (preferred) or fall back to legacy fields.
      type ProgressTokenCarrier = {
        getProgressToken?: () => unknown;
        progressToken?: unknown;
        meta?: { progressToken?: unknown };
        /** legacy/private hook */
        // biome-ignore lint/style/useNamingConvention: external SDK uses _meta for request metadata
        _meta?: { progressToken?: unknown };
      };
      const progressTokenCarrier = extra as unknown as ProgressTokenCarrier;
      const progressTokenCandidate =
        typeof progressTokenCarrier.getProgressToken === "function"
          ? progressTokenCarrier.getProgressToken()
          : (progressTokenCarrier.progressToken ??
            progressTokenCarrier.meta?.progressToken ??
            // Legacy/private path: keep guarded to avoid hard-coupling to internals.
            progressTokenCarrier._meta?.progressToken);
      const progressToken =
        typeof progressTokenCandidate === "string" ||
        typeof progressTokenCandidate === "number"
          ? progressTokenCandidate
          : undefined;
      const onProgress: ProgressCallback = async (message, progress) => {
        if (extra.sendNotification && progressToken) {
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: progress ?? 0,
                total: 100,
                message,
              },
            });
          } catch (err) {
            log("debug", "Failed to send progress notification", {
              error: err instanceof Error ? err.message : err,
            });
          }
        }
        log("debug", `Progress: ${message}`, { progress });
      };

      const result = await runGrammarlyOptimization(config, parsed, onProgress);
      const validatedOutput = ToolOutputSchema.parse(result);

      // Format output based on response_format preference
      // Use result (GrammarlyOptimizeResult) for formatting, validatedOutput for structuredContent
      const textSummary =
        parsed.response_format === "markdown"
          ? formatAsMarkdown(result)
          : JSON.stringify(validatedOutput, null, 2);

      return {
        content: [
          {
            type: "text",
            text: textSummary,
          },
        ],
        structuredContent: validatedOutput,
      };
    },
  );

  const transport = new StdioServerTransport();

  log("info", "Starting Grammarly Browser Use MCP server over stdio");

  const timeoutMs = config.connectTimeoutMs;
  const connectPromise = server.connect(transport);

  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Server connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (error: unknown) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    log("error", "Failed to start MCP server", {
      message: error instanceof Error ? error.message : String(error),
    });

    // Attempt to clean up the transport if it exposes a close method.
    const maybeClose = (transport as { close?: () => unknown }).close;
    if (typeof maybeClose === "function") {
      try {
        await maybeClose();
      } catch {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// Top-level await is supported in Node 18+ ESM.
void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("Fatal error:", error.message);
    console.error(error.stack ?? "(no stack trace)");
  } else {
    console.error("Fatal error (non-Error):", error);
  }
  process.exit(1);
});
