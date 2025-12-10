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
import { GrammarlyAuthError, runStagehandGrammarlyTask } from "./grammarlyTask";
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
  private sessionDebugUrls: Map<string, string> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
    this.sessionManager = new BrowserbaseSessionManager(config);
  }

  async createSession(options?: SessionOptions): Promise<SessionResult> {
    log("debug", "StagehandProvider: Creating session", options);

    // Get or create a Browserbase session with stealth and proxy options
    const sessionInfo = await this.sessionManager.getOrCreateSession({
      contextId: this.config.browserbaseContextId ?? undefined,
      advancedStealth: options?.advancedStealth,
      blockAds: options?.blockAds,
      solveCaptchas: options?.solveCaptchas,
      viewport: options?.viewport,
      proxyEnabled: options?.proxyEnabled,
      // Only pass proxy fields if proxy is enabled
      proxyCountry: options?.proxyEnabled ? options?.proxyCountry : undefined,
      proxyType: options?.proxyEnabled ? options?.proxyType : undefined,
      proxyServer: options?.proxyEnabled ? options?.proxyServer : undefined,
      proxyUsername: options?.proxyEnabled ? options?.proxyUsername : undefined,
      proxyPassword: options?.proxyEnabled ? options?.proxyPassword : undefined,
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

    // Get live URL for debugging (prefer sessionInfo.debugUrl since it's already fetched)
    const liveUrl =
      sessionInfo.debugUrl ??
      (await this.sessionManager.getDebugUrl(sessionInfo.sessionId));

    // Store debug URL for use in scoreText auth error handling
    if (liveUrl) {
      this.sessionDebugUrls.set(sessionInfo.sessionId, liveUrl);
    }

    log("info", "StagehandProvider: Session created", {
      sessionId: sessionInfo.sessionId,
      contextId: sessionInfo.contextId,
      needsLogin: sessionInfo.needsLogin,
      liveUrl,
    });

    return {
      sessionId: sessionInfo.sessionId,
      liveUrl: liveUrl ?? sessionInfo.liveUrl ?? null,
      contextId: sessionInfo.contextId,
      needsLogin: sessionInfo.needsLogin,
      debugUrl: liveUrl ?? undefined,
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

    // Get debug URL for auth error messages
    const debugUrl = this.sessionDebugUrls.get(sessionId);

    try {
      const result = await runStagehandGrammarlyTask(stagehand, text, {
        maxSteps: options?.maxSteps,
        iteration: options?.iteration,
        mode: options?.mode,
        debugUrl,
      });

      const liveUrl = await this.sessionManager.getDebugUrl(sessionId);

      return {
        aiDetectionPercent: result.aiDetectionPercent,
        plagiarismPercent: result.plagiarismPercent,
        notes: result.notes,
        liveUrl,
      };
    } catch (error) {
      // Re-throw auth errors with enhanced messaging
      if (error instanceof GrammarlyAuthError) {
        log("warn", "StagehandProvider: Grammarly auth required", {
          sessionId,
          debugUrl: error.debugUrl,
        });
        throw error;
      }
      throw error;
    }
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

    // Clean up debug URL cache
    this.sessionDebugUrls.delete(sessionId);

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

export {
  checkGrammarlyAuthStatus,
  GrammarlyAuthError,
  runStagehandGrammarlyTask,
} from "./grammarlyTask";
export { type GrammarlyExtractResult, GrammarlyExtractSchema } from "./schemas";
export { BrowserbaseSessionManager } from "./sessionManager";
