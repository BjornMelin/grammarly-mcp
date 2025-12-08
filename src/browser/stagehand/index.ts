import { type AISdkClient, Stagehand } from "@browserbasehq/stagehand";
import type { AppConfig } from "../../config";
import { log } from "../../config";
import {
  createStagehandLlmClient,
  getLlmModelName,
} from "../../llm/stagehandLlm";
import type {
  BrowserProvider,
  GrammarlyScoreResult,
  ScoreOptions,
  SessionOptions,
  SessionResult,
} from "../provider";
import { runStagehandGrammarlyTask } from "./grammarlyTask";
import { BrowserbaseSessionManager } from "./sessionManager";

/**
 * Stagehand + Browserbase provider implementation.
 * Primary provider for Grammarly automation with deterministic act/extract/observe.
 */
export class StagehandProvider implements BrowserProvider {
  readonly providerName = "stagehand" as const;
  private readonly config: AppConfig;
  private readonly sessionManager: BrowserbaseSessionManager;
  private stagehandInstances: Map<string, Stagehand> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
    this.sessionManager = new BrowserbaseSessionManager(config);
  }

  async createSession(options?: SessionOptions): Promise<SessionResult> {
    log("debug", "StagehandProvider: Creating session", options);

    // Get or create a Browserbase session
    const sessionInfo = await this.sessionManager.getOrCreateSession({
      contextId: this.config.browserbaseContextId ?? undefined,
    });

    let stagehand: Stagehand;
    try {
      // Create Stagehand instance connected to this session
      stagehand = await this.createStagehandInstance(sessionInfo.sessionId);
      this.stagehandInstances.set(sessionInfo.sessionId, stagehand);
    } catch (error) {
      log("error", "StagehandProvider: Failed to initialize Stagehand", {
        sessionId: sessionInfo.sessionId,
        error,
      });
      await this.sessionManager.closeSession(sessionInfo.sessionId);
      throw error;
    }

    // Get live URL for debugging
    const liveUrl = await this.sessionManager.getDebugUrl(
      sessionInfo.sessionId,
    );

    log("info", "StagehandProvider: Session created", {
      sessionId: sessionInfo.sessionId,
      contextId: sessionInfo.contextId,
      liveUrl,
    });

    return {
      sessionId: sessionInfo.sessionId,
      liveUrl: liveUrl ?? sessionInfo.liveUrl ?? null,
      contextId: sessionInfo.contextId,
    };
  }

  async scoreText(
    sessionId: string,
    text: string,
    options?: ScoreOptions,
  ): Promise<GrammarlyScoreResult> {
    log("debug", "StagehandProvider: Scoring text", {
      sessionId,
      textLength: text.length,
      options,
    });

    const stagehand = this.stagehandInstances.get(sessionId);
    if (!stagehand) {
      throw new Error(`No Stagehand instance found for session: ${sessionId}`);
    }

    const result = await runStagehandGrammarlyTask(stagehand, text, {
      maxSteps: options?.maxSteps,
      iteration: options?.iteration,
      mode: options?.mode,
    });

    const liveUrl = await this.sessionManager.getDebugUrl(sessionId);

    return {
      aiDetectionPercent: result.aiDetectionPercent,
      plagiarismPercent: result.plagiarismPercent,
      overallScore: result.overallScore,
      notes: result.notes,
      liveUrl,
    };
  }

  async closeSession(sessionId: string): Promise<void> {
    log("debug", "StagehandProvider: Closing session", { sessionId });

    // Close Stagehand instance
    const stagehand = this.stagehandInstances.get(sessionId);
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (error) {
        log("warn", "Failed to close Stagehand instance", { error });
      }
      this.stagehandInstances.delete(sessionId);
    }

    // Close Browserbase session
    await this.sessionManager.closeSession(sessionId);
  }

  /**
   * Create a Stagehand instance connected to an existing Browserbase session.
   */
  private async createStagehandInstance(sessionId: string): Promise<Stagehand> {
    const { browserbaseApiKey, browserbaseProjectId } = this.config;
    if (!browserbaseApiKey || !browserbaseProjectId) {
      throw new Error(
        "BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required for Stagehand provider",
      );
    }

    log("debug", "Creating Stagehand instance", {
      sessionId,
      model: getLlmModelName(this.config),
    });

    // Create LLM client for Stagehand
    const llmClient = await createStagehandLlmClient(this.config);

    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: browserbaseApiKey,
      projectId: browserbaseProjectId,
      // Connect to existing session
      browserbaseSessionID: sessionId,
      // LLM configuration with proper AISdkClient type
      llmClient: llmClient as AISdkClient,
      // Self-healing for DOM changes
      selfHeal: true,
      // Verbosity based on log level
      verbose: this.config.logLevel === "debug" ? 2 : 1,
      // Optional caching for repeated actions
      ...(this.config.stagehandCacheDir && {
        cacheDir: this.config.stagehandCacheDir,
      }),
    });

    await stagehand.init();

    log("debug", "Stagehand instance initialized", { sessionId });

    return stagehand;
  }
}

export { runStagehandGrammarlyTask } from "./grammarlyTask";
export { type GrammarlyExtractResult, GrammarlyExtractSchema } from "./schemas";
export { BrowserbaseSessionManager } from "./sessionManager";
