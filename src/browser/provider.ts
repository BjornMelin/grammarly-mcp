import type { AppConfig } from "../config";
import type { GrammarlyScores } from "./grammarlyTask";

/**
 * Options for creating a browser session.
 * Matches the output of getSessionOptions() from config.ts.
 */
export interface SessionOptions {
  /** Enable stealth mode (level !== 'none') */
  stealth?: boolean;
  /** Enable advanced stealth (Browserbase Scale plan feature) */
  advancedStealth?: boolean;
  /** Block ads for faster loading */
  blockAds?: boolean;
  /** Auto-solve CAPTCHAs */
  solveCaptchas?: boolean;
  /** Browser viewport dimensions */
  viewport?: { width: number; height: number };
  /** Proxy country code (ISO 3166-1 alpha-2, uppercase) */
  proxyCountry?: string;
  /** Whether proxy is enabled */
  proxyEnabled?: boolean;

  // === BYOP (Bring Your Own Proxy) fields ===
  /** Proxy type: "browserbase" (built-in) | "external" (BYOP) */
  proxyType?: "browserbase" | "external";
  /** External proxy server URL, e.g., "http://geo.iproyal.com:12321" */
  proxyServer?: string;
  /** Proxy authentication username */
  proxyUsername?: string;
  /** Proxy authentication password (with IPRoyal params if applicable) */
  proxyPassword?: string;
}

/**
 * Result from creating a browser session.
 */
export interface SessionResult {
  sessionId: string;
  liveUrl: string | null;
  contextId?: string;
  /** True when fresh context needs manual Grammarly login */
  needsLogin?: boolean;
  /** Debug URL for manual browser intervention */
  debugUrl?: string;
}

/**
 * Options for scoring text via Grammarly.
 */
export interface ScoreOptions {
  maxSteps?: number;
  iteration?: number;
  mode?: string;
  flashMode?: boolean;
}

/**
 * Extended Grammarly scores with session metadata.
 */
export interface GrammarlyScoreResult extends GrammarlyScores {
  liveUrl?: string | null;
}

/**
 * Abstract interface for browser automation providers.
 * Supports both Stagehand (Browserbase) and Browser Use Cloud.
 */
export interface BrowserProvider {
  readonly providerName: "stagehand" | "browser-use";

  /**
   * Create a new browser session for Grammarly automation.
   */
  createSession(options?: SessionOptions): Promise<SessionResult>;

  /**
   * Score text using Grammarly's AI detector and plagiarism checker.
   */
  scoreText(
    sessionId: string,
    text: string,
    options?: ScoreOptions,
  ): Promise<GrammarlyScoreResult>;

  /**
   * Close and cleanup a browser session.
   */
  closeSession(sessionId: string): Promise<void>;
}

/**
 * Create a browser provider based on the configured provider type.
 */
export async function createBrowserProvider(
  config: AppConfig,
): Promise<BrowserProvider> {
  switch (config.browserProvider) {
    case "stagehand": {
      const { StagehandProvider } = await import("./stagehand/index");
      return new StagehandProvider(config);
    }
    case "browser-use": {
      const { BrowserUseProvider } = await import("./browserUseProvider");
      return new BrowserUseProvider(config);
    }
    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const exhaustiveCheck: never = config.browserProvider;
      throw new Error(`Unknown browser provider: ${exhaustiveCheck}`);
    }
  }
}
