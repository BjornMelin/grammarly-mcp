import type { AppConfig } from "../config";
import { log } from "../config";
import {
  createBrowserUseClient,
  createGrammarlySession,
  runGrammarlyScoreTask,
} from "./grammarlyTask";
import type {
  BrowserProvider,
  GrammarlyScoreResult,
  ScoreOptions,
  SessionOptions,
  SessionResult,
} from "./provider";

/**
 * Browser Use Cloud provider implementation.
 * Wraps the existing grammarlyTask.ts functionality for the provider abstraction.
 */
export class BrowserUseProvider implements BrowserProvider {
  readonly providerName = "browser-use" as const;
  private readonly config: AppConfig;
  private client: ReturnType<typeof createBrowserUseClient> | null = null;
  private activeSessions: Map<string, string | null> = new Map(); // sessionId -> liveUrl

  constructor(config: AppConfig) {
    this.config = config;
  }

  private getClient(): ReturnType<typeof createBrowserUseClient> {
    if (!this.client) {
      this.client = createBrowserUseClient(this.config);
    }
    return this.client;
  }

  async createSession(options?: SessionOptions): Promise<SessionResult> {
    log("debug", "BrowserUseProvider: Creating session", options);

    const client = this.getClient();
    const result = await createGrammarlySession(client, this.config, {
      proxyCountry: options?.proxyCountry,
    });

    this.activeSessions.set(result.sessionId, result.liveUrl);

    return {
      sessionId: result.sessionId,
      liveUrl: result.liveUrl,
    };
  }

  async scoreText(
    sessionId: string,
    text: string,
    options?: ScoreOptions,
  ): Promise<GrammarlyScoreResult> {
    log("debug", "BrowserUseProvider: Scoring text", {
      sessionId,
      textLength: text.length,
      options,
    });

    const client = this.getClient();
    const liveUrl = this.activeSessions.get(sessionId) ?? null;

    const scores = await runGrammarlyScoreTask(
      client,
      sessionId,
      text,
      this.config,
      {
        llm: "browser-use-llm",
        flashMode: options?.flashMode ?? false,
        maxSteps: options?.maxSteps,
        iteration: options?.iteration,
        mode: options?.mode,
      },
      liveUrl,
    );

    return {
      aiDetectionPercent: scores.aiDetectionPercent,
      plagiarismPercent: scores.plagiarismPercent,
      notes: scores.notes,
      liveUrl: scores.liveUrl,
    };
  }

  async closeSession(sessionId: string): Promise<void> {
    log("debug", "BrowserUseProvider: Closing session", { sessionId });

    try {
      const client = this.getClient();
      await client.sessions.deleteSession({
        session_id: sessionId,
      });
      log("debug", "BrowserUseProvider: Session closed", { sessionId });
    } catch (error) {
      log("warn", "BrowserUseProvider: Failed to close session", {
        sessionId,
        error,
      });
    } finally {
      // Always cleanup local state regardless of API success/failure
      this.activeSessions.delete(sessionId);
    }
  }
}
