import Browserbase from "@browserbasehq/sdk";
import type { AppConfig } from "../../config";
import { log } from "../../config";

export interface SessionInfo {
  sessionId: string;
  contextId?: string;
  liveUrl?: string;
  status?: string;
}

/**
 * Manages Browserbase sessions and contexts for persistent login state.
 * Supports session reuse and context persistence for Grammarly authentication.
 */
export class BrowserbaseSessionManager {
  private readonly bb: Browserbase;
  private readonly projectId: string;
  private cachedSessionId: string | null = null;
  private cachedContextId: string | null = null;

  constructor(config: AppConfig) {
    if (!config.browserbaseApiKey || !config.browserbaseProjectId) {
      throw new Error(
        "BrowserbaseSessionManager requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID",
      );
    }

    this.bb = new Browserbase({ apiKey: config.browserbaseApiKey });
    this.projectId = config.browserbaseProjectId;

    // Use provided session/context IDs if available
    this.cachedSessionId = config.browserbaseSessionId ?? null;
    this.cachedContextId = config.browserbaseContextId ?? null;

    log("debug", "BrowserbaseSessionManager initialized", {
      projectId: this.projectId,
      hasSessionId: !!this.cachedSessionId,
      hasContextId: !!this.cachedContextId,
    });
  }

  /**
   * Get the current cached session ID if available.
   */
  getCachedSessionId(): string | null {
    return this.cachedSessionId;
  }

  /**
   * Get the current cached context ID if available.
   */
  getCachedContextId(): string | null {
    return this.cachedContextId;
  }

  /**
   * Check if a cached session is still running.
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    try {
      const session = await this.bb.sessions.retrieve(sessionId);
      return session.status === "RUNNING";
    } catch {
      log("debug", "Session not found or expired", { sessionId });
      return false;
    }
  }

  /**
   * Get or create a Browserbase session with optional context for login persistence.
   */
  async getOrCreateSession(options?: {
    contextId?: string;
    forceNew?: boolean;
  }): Promise<SessionInfo> {
    // Try to reuse existing session if valid
    if (!options?.forceNew && this.cachedSessionId) {
      const isActive = await this.isSessionActive(this.cachedSessionId);
      if (isActive) {
        log("debug", "Reusing existing Browserbase session", {
          sessionId: this.cachedSessionId,
        });
        return {
          sessionId: this.cachedSessionId,
          contextId: this.cachedContextId ?? undefined,
        };
      }
      log("debug", "Cached session expired, creating new one");
    }

    const contextId = options?.contextId ?? this.cachedContextId ?? undefined;

    // Build session create params
    const createParams: Parameters<typeof this.bb.sessions.create>[0] = {
      projectId: this.projectId,
      browserSettings: {
        // Advanced stealth mode to avoid detection
        advancedStealth: true,
        // Auto-solve CAPTCHAs
        solveCaptchas: true,
        // Block ads for faster loading
        blockAds: true,
      },
    };

    // Add context if available
    if (contextId) {
      createParams.browserSettings = {
        ...createParams.browserSettings,
        context: { id: contextId, persist: true },
      };
    }

    // Create new session
    const session = await this.bb.sessions.create(createParams);

    this.cachedSessionId = session.id;

    // Extract context ID from session response
    const newContextId = session.contextId ?? contextId;

    if (newContextId) {
      this.cachedContextId = newContextId;
    }

    log("info", "Created Browserbase session", {
      sessionId: session.id,
      contextId: newContextId,
    });

    return {
      sessionId: session.id,
      contextId: newContextId,
      status: session.status,
    };
  }

  /**
   * Close a session and release resources.
   * Note: We don't delete the context to preserve login state.
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      // Terminate the session via Browserbase SDK
      await this.bb.sessions.update(sessionId, { status: "REQUEST_RELEASE" });
      log("debug", "Requested session release from Browserbase", { sessionId });

      if (this.cachedSessionId === sessionId) {
        this.cachedSessionId = null;
      }

      log("debug", "Closed Browserbase session", { sessionId });
    } catch (error) {
      log("warn", "Failed to close Browserbase session", { sessionId, error });
    }
  }

  /**
   * Create a new persistent context for storing login state.
   * Call this once during initial Grammarly login setup.
   */
  async createContext(): Promise<string> {
    const context = await this.bb.contexts.create({
      projectId: this.projectId,
    });

    this.cachedContextId = context.id;
    log("info", "Created Browserbase context for persistent login", {
      contextId: context.id,
    });

    return context.id;
  }

  /**
   * Get debug URL for live session viewing.
   */
  async getDebugUrl(sessionId: string): Promise<string | null> {
    try {
      const debug = await this.bb.sessions.debug(sessionId);
      return debug.debuggerFullscreenUrl ?? debug.debuggerUrl ?? null;
    } catch (error) {
      log("debug", "Failed to get debug URL", { sessionId, error });
      return null;
    }
  }
}
