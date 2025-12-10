import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../../src/config";

// Create mock functions at top level
const mockSessionsCreate = vi.fn();
const mockSessionsRetrieve = vi.fn();
const mockSessionsUpdate = vi.fn();
const mockSessionsDebug = vi.fn();
const mockContextsCreate = vi.fn();

// Mock Browserbase SDK - must be before import
vi.mock("@browserbasehq/sdk", () => {
	return {
		default: class MockBrowserbase {
			sessions = {
				create: mockSessionsCreate,
				retrieve: mockSessionsRetrieve,
				update: mockSessionsUpdate,
				debug: mockSessionsDebug,
			};
			contexts = {
				create: mockContextsCreate,
			};
		},
	};
});

// Import after mocking
import { BrowserbaseSessionManager } from "../../../../src/browser/stagehand/sessionManager";

const baseConfig: AppConfig = {
	ignoreSystemEnv: false,
	browserProvider: "stagehand",
	browserUseApiKey: undefined,
	browserUseProfileId: undefined,
	browserbaseApiKey: "test-api-key",
	browserbaseProjectId: "test-project-id",
	browserbaseSessionId: undefined,
	browserbaseContextId: undefined,
	stagehandModel: "gemini-2.5-flash",
	stagehandCacheDir: undefined,
	stagehandLlmProvider: undefined,
	rewriteLlmProvider: undefined,
	claudeModel: "auto",
	openaiModel: "gpt-4o",
	googleModel: "gemini-2.5-flash",
	anthropicModel: "claude-sonnet-4-20250514",
	claudeApiKey: "test-claude-key",
	openaiApiKey: undefined,
	googleApiKey: undefined,
	anthropicApiKey: undefined,
	llmRequestTimeoutMs: 120000,
	connectTimeoutMs: 30000,
	logLevel: "error",
	browserUseDefaultTimeoutMs: 300000,
	defaultMaxAiPercent: 10,
	defaultMaxPlagiarismPercent: 5,
	defaultMaxIterations: 5,
	proxyConfig: null,
	stealthConfig: null,
};

describe("BrowserbaseSessionManager", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("throws when browserbaseApiKey is missing", () => {
			const config = { ...baseConfig, browserbaseApiKey: undefined };

			expect(() => new BrowserbaseSessionManager(config)).toThrow(
				"BrowserbaseSessionManager requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID"
			);
		});

		it("throws when browserbaseProjectId is missing", () => {
			const config = { ...baseConfig, browserbaseProjectId: undefined };

			expect(() => new BrowserbaseSessionManager(config)).toThrow(
				"BrowserbaseSessionManager requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID"
			);
		});

		it("initializes successfully with valid config", () => {
			const manager = new BrowserbaseSessionManager(baseConfig);
			expect(manager).toBeInstanceOf(BrowserbaseSessionManager);
		});

		it("uses provided sessionId from config", () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "existing-session-123",
			};

			const manager = new BrowserbaseSessionManager(config);
			expect(manager.getCachedSessionId()).toBe("existing-session-123");
		});

		it("uses provided contextId from config", () => {
			const config = {
				...baseConfig,
				browserbaseContextId: "existing-context-456",
			};

			const manager = new BrowserbaseSessionManager(config);
			expect(manager.getCachedContextId()).toBe("existing-context-456");
		});
	});

	describe("getCachedSessionId", () => {
		it("returns null when no session is cached", () => {
			const manager = new BrowserbaseSessionManager(baseConfig);
			expect(manager.getCachedSessionId()).toBeNull();
		});
	});

	describe("getCachedContextId", () => {
		it("returns null when no context is cached", () => {
			const manager = new BrowserbaseSessionManager(baseConfig);
			expect(manager.getCachedContextId()).toBeNull();
		});
	});

	describe("isSessionActive", () => {
		it("returns true when session status is RUNNING", async () => {
			mockSessionsRetrieve.mockResolvedValueOnce({ status: "RUNNING" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			const isActive = await manager.isSessionActive("session-123");

			expect(isActive).toBe(true);
			expect(mockSessionsRetrieve).toHaveBeenCalledWith("session-123");
		});

		it("returns false when session status is not RUNNING", async () => {
			mockSessionsRetrieve.mockResolvedValueOnce({ status: "STOPPED" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			const isActive = await manager.isSessionActive("session-123");

			expect(isActive).toBe(false);
		});

		it("returns false when session retrieval fails", async () => {
			mockSessionsRetrieve.mockRejectedValueOnce(new Error("Not found"));

			const manager = new BrowserbaseSessionManager(baseConfig);
			const isActive = await manager.isSessionActive("session-123");

			expect(isActive).toBe(false);
		});
	});

	describe("getOrCreateSession", () => {
		it("reuses existing session when still active", async () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "existing-session",
				browserbaseContextId: "existing-context",
			};
			mockSessionsRetrieve.mockResolvedValueOnce({ status: "RUNNING" });

			const manager = new BrowserbaseSessionManager(config);
			const result = await manager.getOrCreateSession();

			expect(result).toEqual({
				sessionId: "existing-session",
				contextId: "existing-context",
			});
			expect(mockSessionsCreate).not.toHaveBeenCalled();
		});

		it("creates new session when cached session is expired", async () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "expired-session",
			};
			mockSessionsRetrieve.mockResolvedValueOnce({ status: "STOPPED" });
			// Auto-create context when none exists
			mockContextsCreate.mockResolvedValueOnce({ id: "auto-context-id" });
			mockSessionsCreate.mockResolvedValueOnce({
				id: "new-session-id",
				contextId: "auto-context-id",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(config);
			const result = await manager.getOrCreateSession();

			expect(result.sessionId).toBe("new-session-id");
			expect(mockSessionsCreate).toHaveBeenCalled();
		});

		it("creates new session when forceNew is true", async () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "existing-session",
			};
			// Auto-create context when none exists
			mockContextsCreate.mockResolvedValueOnce({ id: "auto-context-id" });
			mockSessionsCreate.mockResolvedValueOnce({
				id: "forced-new-session",
				contextId: "auto-context-id",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(config);
			const result = await manager.getOrCreateSession({ forceNew: true });

			expect(result.sessionId).toBe("forced-new-session");
			expect(mockSessionsRetrieve).not.toHaveBeenCalled();
			expect(mockSessionsCreate).toHaveBeenCalled();
		});

		it("includes context in session creation when provided", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "new-session",
				contextId: "my-context",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({ contextId: "my-context" });

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.browserSettings.context).toEqual({
				id: "my-context",
				persist: true,
			});
			// Should NOT call createContext when contextId is provided
			expect(mockContextsCreate).not.toHaveBeenCalled();
		});

		it("caches the new session ID", async () => {
			// Auto-create context when none exists
			mockContextsCreate.mockResolvedValueOnce({ id: "auto-context-id" });
			mockSessionsCreate.mockResolvedValueOnce({
				id: "cached-session",
				contextId: "auto-context-id",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession();

			expect(manager.getCachedSessionId()).toBe("cached-session");
		});

		it("caches the new context ID", async () => {
			// Auto-create context when none exists
			mockContextsCreate.mockResolvedValueOnce({ id: "auto-context-id" });
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session",
				contextId: "auto-context-id",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession();

			expect(manager.getCachedContextId()).toBe("auto-context-id");
		});

		it("auto-creates context when none provided and sets needsLogin", async () => {
			mockContextsCreate.mockResolvedValueOnce({ id: "new-auto-context" });
			mockSessionsCreate.mockResolvedValueOnce({
				id: "new-session",
				contextId: "new-auto-context",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			const result = await manager.getOrCreateSession();

			expect(result.needsLogin).toBe(true);
			expect(result.debugUrl).toBe("https://debug.url");
			expect(result.contextId).toBe("new-auto-context");
			expect(mockContextsCreate).toHaveBeenCalledWith({ projectId: "test-project-id" });
		});

		it("does not set needsLogin when context is provided", async () => {
			const config = {
				...baseConfig,
				browserbaseContextId: "existing-context",
			};
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session",
				contextId: "existing-context",
				status: "RUNNING",
			});
			mockSessionsDebug.mockResolvedValueOnce({ debuggerFullscreenUrl: "https://debug.url" });

			const manager = new BrowserbaseSessionManager(config);
			const result = await manager.getOrCreateSession();

			expect(result.needsLogin).toBe(false);
			expect(mockContextsCreate).not.toHaveBeenCalled();
		});
	});

	describe("closeSession", () => {
		beforeEach(() => {
			mockSessionsUpdate.mockResolvedValue(undefined);
		});

		it("clears cached session ID when matching", async () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "session-to-close",
			};

			const manager = new BrowserbaseSessionManager(config);
			expect(manager.getCachedSessionId()).toBe("session-to-close");

			await manager.closeSession("session-to-close");

			expect(manager.getCachedSessionId()).toBeNull();
		});

		it("does not clear cached session ID when not matching", async () => {
			const config = {
				...baseConfig,
				browserbaseSessionId: "different-session",
			};

			const manager = new BrowserbaseSessionManager(config);
			await manager.closeSession("other-session");

			expect(manager.getCachedSessionId()).toBe("different-session");
		});

		it("does not throw when session update fails", async () => {
			mockSessionsUpdate.mockRejectedValueOnce(new Error("Session update failed"));

			const manager = new BrowserbaseSessionManager(baseConfig);

			// Should not throw
			await expect(manager.closeSession("any-session")).resolves.not.toThrow();
		});

		it("preserves cached session ID when close fails", async () => {
			mockSessionsUpdate.mockRejectedValueOnce(new Error("Session update failed"));
			const config = {
				...baseConfig,
				browserbaseSessionId: "session-to-close",
			};

			const manager = new BrowserbaseSessionManager(config);
			await manager.closeSession("session-to-close");

			// Cache should NOT be cleared since the update failed (error was caught)
			// Note: Current implementation clears cache before the update call, so this checks behavior
			expect(manager.getCachedSessionId()).toBe("session-to-close");
		});
	});

	describe("createContext", () => {
		it("creates a new context and caches the ID", async () => {
			mockContextsCreate.mockResolvedValueOnce({ id: "new-context-id" });

			const manager = new BrowserbaseSessionManager(baseConfig);
			const contextId = await manager.createContext();

			expect(contextId).toBe("new-context-id");
			expect(manager.getCachedContextId()).toBe("new-context-id");
			expect(mockContextsCreate).toHaveBeenCalledWith({
				projectId: "test-project-id",
			});
		});
	});

	describe("getDebugUrl", () => {
		it("returns debuggerFullscreenUrl when available", async () => {
			mockSessionsDebug.mockResolvedValueOnce({
				debuggerFullscreenUrl: "https://debug.full.url",
				debuggerUrl: "https://debug.url",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			const url = await manager.getDebugUrl("session-123");

			expect(url).toBe("https://debug.full.url");
		});

		it("falls back to debuggerUrl when fullscreen not available", async () => {
			mockSessionsDebug.mockResolvedValueOnce({
				debuggerUrl: "https://debug.url",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			const url = await manager.getDebugUrl("session-123");

			expect(url).toBe("https://debug.url");
		});

		it("returns null when debug call fails", async () => {
			mockSessionsDebug.mockRejectedValueOnce(new Error("Debug failed"));

			const manager = new BrowserbaseSessionManager(baseConfig);
			const url = await manager.getDebugUrl("session-123");

			expect(url).toBeNull();
		});

		it("returns null when no debug URLs available", async () => {
			mockSessionsDebug.mockResolvedValueOnce({});

			const manager = new BrowserbaseSessionManager(baseConfig);
			const url = await manager.getDebugUrl("session-123");

			expect(url).toBeNull();
		});
	});

	describe("BYOP (Bring Your Own Proxy) support", () => {
		beforeEach(() => {
			mockContextsCreate.mockResolvedValueOnce({ id: "auto-context-id" });
			mockSessionsDebug.mockResolvedValueOnce({
				debuggerFullscreenUrl: "https://debug.url",
			});
		});

		it("passes external proxy config to session creation", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-with-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({
				proxyEnabled: true,
				proxyType: "external",
				proxyServer: "http://geo.iproyal.com:12321",
				proxyUsername: "iproyal_user",
				proxyPassword: "iproyal_pass_country-us",
			});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toEqual([
				{
					type: "external",
					server: "http://geo.iproyal.com:12321",
					username: "iproyal_user",
					password: "iproyal_pass_country-us",
				},
			]);
		});

		it("passes browserbase proxy config with geolocation", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-with-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({
				proxyEnabled: true,
				proxyType: "browserbase",
				proxyCountry: "US",
			});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toEqual([
				{
					type: "browserbase",
					geolocation: { country: "US" },
				},
			]);
		});

		it("enables generic proxy when proxyEnabled=true without type or country", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-with-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({
				proxyEnabled: true,
			});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toBe(true);
		});

		it("does not include proxies when proxyEnabled=false", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-without-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({
				proxyEnabled: false,
				proxyType: "external",
				proxyServer: "http://proxy.example.com:8080",
			});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toBeUndefined();
		});

		it("does not include proxies when no proxy options provided", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-no-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toBeUndefined();
		});

		it("external proxy type requires proxyServer to be set", async () => {
			const manager = new BrowserbaseSessionManager(baseConfig);

			// proxyType='external' without proxyServer should throw validation error
			await expect(
				manager.getOrCreateSession({
					proxyEnabled: true,
					proxyType: "external",
					// proxyServer not provided - should throw error
				})
			).rejects.toThrow(
				"proxyType='external' requires proxyServer to be set; configuration is missing"
			);
		});

		it("includes external proxy with optional username/password", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session-with-proxy",
				contextId: "auto-context-id",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({
				proxyEnabled: true,
				proxyType: "external",
				proxyServer: "http://open-proxy.example.com:8080",
				// No username or password - some proxies don't require auth
			});

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.proxies).toEqual([
				{
					type: "external",
					server: "http://open-proxy.example.com:8080",
					username: undefined,
					password: undefined,
				},
			]);
		});
	});
});
