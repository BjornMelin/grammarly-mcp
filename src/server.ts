#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config, log } from "./config";
import {
  type GrammarlyOptimizeInput,
  type ProgressCallback,
  runGrammarlyOptimization,
  ToolInputSchema,
  ToolOutputSchema,
} from "./grammarlyOptimizer";

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
      name: "grammarly-browseruse-mcp-server",
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
        "Use Grammarly docs via Browser Use Cloud to score AI detection and plagiarism, and optionally rewrite text with Claude to reduce detection. " +
        "Supports three modes: 'score_only' (just get scores), 'analyze' (get scores + analysis), 'optimize' (iteratively rewrite to meet thresholds).",
      inputSchema: ToolInputSchema,
      outputSchema: ToolOutputSchema,
      annotations: {
        readOnlyHint: false, // Tool can rewrite text
        destructiveHint: false, // Non-destructive (original preserved in input)
        idempotentHint: false, // Each run may produce different results
        openWorldHint: true, // Interacts with Grammarly and Claude APIs
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
        _meta?: { progressToken?: unknown };
      };
      const progressTokenCarrier = extra as unknown as ProgressTokenCarrier;
      const progressTokenCandidate =
        typeof progressTokenCarrier.getProgressToken === "function"
          ? progressTokenCarrier.getProgressToken()
          : progressTokenCarrier.progressToken ??
            // Legacy/private path: keep guarded to avoid hard-coupling to internals.
            progressTokenCarrier._meta?.progressToken;
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

      // Return both text content (for compatibility) and structured content (MCP 2025-11-25)
      const textSummary = JSON.stringify(validatedOutput, null, 2);

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
