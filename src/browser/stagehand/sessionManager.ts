import Browserbase from "@browserbasehq/sdk";
import type { AppConfig } from "../../config";
import { log } from "../../config";

export interface SessionInfo {
  sessionId: string;
  contextId?: string;
  liveUrl?: string;
  status?: string;
  /** True when fresh context needs manual Grammarly login */
  needsLogin?: boolean;
  /** Debug URL for manual browser intervention */
  debugUrl?: string;
}

/** Browserbase built-in proxy with geolocation */
type BrowserbaseProxy = {
  type: "browserbase";
  geolocation: { country: string };
};

/** External proxy (BYOP) configuration */
type ExternalProxy = {
  type: "external";
  server: string;
  username?: string;
  password?: string;
};

/** Proxy configuration result: array of proxy configs, generic true, or undefined if disabled */
type ProxyConfig = Array<BrowserbaseProxy | ExternalProxy> | true | undefined;

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
   * Accepts stealth and proxy options from getSessionOptions().
   */
  async getOrCreateSession(options?: {
    contextId?: string;
    forceNew?: boolean;
    // Stealth options
    advancedStealth?: boolean;
    blockAds?: boolean;
    solveCaptchas?: boolean;
    viewport?: { width: number; height: number };
    // Proxy options (built-in)
    proxyCountry?: string;
    proxyEnabled?: boolean;
    // BYOP (Bring Your Own Proxy) options
    proxyType?: "browserbase" | "external";
    proxyServer?: string;
    proxyUsername?: string;
    proxyPassword?: string;
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

    // Determine context: use provided, cached, or auto-create new one
    let contextId = options?.contextId ?? this.cachedContextId ?? undefined;
    let needsLogin = false;

    // Auto-create context if none available (first-time setup)
    if (!contextId) {
      log("info", "No context ID available, creating new persistent context");
      contextId = await this.createContext();
      needsLogin = true; // Fresh context has no auth
    }

    // Build proxy configuration (supports both built-in and external proxies)
    const proxies = this.buildProxyConfig(options);

    // Build session create params with configurable stealth settings
    // Default advancedStealth to false since it requires Browserbase Scale plan
    const createParams: Parameters<typeof this.bb.sessions.create>[0] = {
      projectId: this.projectId,
      ...(proxies && { proxies }),
      browserSettings: {
        advancedStealth: options?.advancedStealth ?? false,
        solveCaptchas: options?.solveCaptchas ?? true,
        blockAds: options?.blockAds ?? true,
        ...(options?.viewport && { viewport: options.viewport }),
      },
    };

    // Add context if available
    if (contextId) {
      createParams.browserSettings = {
        ...createParams.browserSettings,
        context: { id: contextId, persist: true },
      };
    }

    log("debug", "Creating Browserbase session", {
      proxyEnabled: options?.proxyEnabled,
      proxyType: options?.proxyType ?? "browserbase",
      proxyCountry: options?.proxyCountry,
      proxyServer: options?.proxyServer ? "[external]" : undefined,
      advancedStealth: createParams.browserSettings?.advancedStealth,
      viewport: options?.viewport,
    });

    // Create new session
    const session = await this.bb.sessions.create(createParams);

    this.cachedSessionId = session.id;

    // Extract context ID from session response
    const newContextId = session.contextId ?? contextId;

    if (newContextId) {
      this.cachedContextId = newContextId;
    }

    // Fetch debug URL for manual intervention
    const debugUrl = await this.getDebugUrl(session.id);

    log("info", "Created Browserbase session", {
      sessionId: session.id,
      contextId: newContextId,
      needsLogin,
      debugUrl,
    });

    return {
      sessionId: session.id,
      contextId: newContextId,
      status: session.status,
      needsLogin,
      debugUrl: debugUrl ?? undefined,
    };
  }

  /**
   * Close a session and release resources.
   * Note: We don't delete the context to preserve login state.
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      await this.bb.sessions.update(sessionId, {
        status: "REQUEST_RELEASE",
        projectId: this.projectId,
      });

      // Clear cache entry (session will timeout/close automatically on Browserbase side)
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

  /**
   * Build Browserbase proxy configuration from options.
   * Supports both built-in geolocation proxies and external (BYOP) proxies.
   *
   * @returns Proxy config array for Browserbase API, true for generic proxy, or undefined if disabled
   */
  private buildProxyConfig(options?: {
    proxyEnabled?: boolean;
    proxyType?: "browserbase" | "external";
    proxyCountry?: string;
    proxyServer?: string;
    proxyUsername?: string;
    proxyPassword?: string;
  }): ProxyConfig {
    if (!options?.proxyEnabled) {
      return undefined;
    }

    // External proxy (BYOP) - use IPRoyal or other external proxy
    if (options.proxyType === "external") {
      if (!options.proxyServer) {
        throw new Error(
          "proxyType='external' requires proxyServer to be set; configuration is missing",
        );
      }
      log("debug", "Using external proxy (BYOP)", {
        server: options.proxyServer,
        username: options.proxyUsername ? "***" : undefined,
      });
      return [
        {
          type: "external" as const,
          server: options.proxyServer,
          username: options.proxyUsername,
          password: options.proxyPassword,
        },
      ];
    }

    // Browserbase built-in proxy with geolocation
    if (options.proxyCountry) {
      log("debug", "Using Browserbase geolocation proxy", {
        country: options.proxyCountry,
      });
      return [
        {
          type: "browserbase" as const,
          geolocation: { country: options.proxyCountry },
        },
      ];
    }

    // Generic proxy without geolocation (Browserbase selects automatically)
    log("debug", "Using generic Browserbase proxy");
    return true;
  }
}
