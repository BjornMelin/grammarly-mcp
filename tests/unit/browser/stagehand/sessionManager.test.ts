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
	browserProvider: "stagehand",
	browserUseApiKey: undefined,
	browserUseProfileId: undefined,
	browserbaseApiKey: "test-api-key",
	browserbaseProjectId: "test-project-id",
	browserbaseSessionId: undefined,
	browserbaseContextId: undefined,
	stagehandModel: "gpt-4o",
	stagehandCacheDir: undefined,
	claudeApiKey: "test-claude-key",
	claudeRequestTimeoutMs: 120000,
	connectTimeoutMs: 30000,
	logLevel: "error",
	browserUseDefaultTimeoutMs: 300000,
	defaultMaxAiPercent: 10,
	defaultMaxPlagiarismPercent: 5,
	defaultMaxIterations: 5,
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
			mockSessionsCreate.mockResolvedValueOnce({
				id: "new-session-id",
				contextId: "new-context-id",
				status: "RUNNING",
			});

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
			mockSessionsCreate.mockResolvedValueOnce({
				id: "forced-new-session",
				status: "RUNNING",
			});

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

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession({ contextId: "my-context" });

			const createCall = mockSessionsCreate.mock.calls[0][0];
			expect(createCall.browserSettings.context).toEqual({
				id: "my-context",
				persist: true,
			});
		});

		it("caches the new session ID", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "cached-session",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession();

			expect(manager.getCachedSessionId()).toBe("cached-session");
		});

		it("caches the new context ID", async () => {
			mockSessionsCreate.mockResolvedValueOnce({
				id: "session",
				contextId: "cached-context",
				status: "RUNNING",
			});

			const manager = new BrowserbaseSessionManager(baseConfig);
			await manager.getOrCreateSession();

			expect(manager.getCachedContextId()).toBe("cached-context");
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
});
