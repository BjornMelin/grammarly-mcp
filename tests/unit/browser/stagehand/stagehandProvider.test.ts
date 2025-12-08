import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../../src/config";

// Mock functions at top level
const mockStagehandClose = vi.fn();
const mockStagehandInit = vi.fn();
const mockGetOrCreateSession = vi.fn();
const mockCloseSession = vi.fn();
const mockGetDebugUrl = vi.fn();
const mockRunStagehandGrammarlyTask = vi.fn();

// Mock Stagehand class
vi.mock("@browserbasehq/stagehand", () => ({
	Stagehand: class MockStagehand {
		init = mockStagehandInit;
		close = mockStagehandClose;
		context = { pages: vi.fn().mockReturnValue([{}]) };
	},
}));

// Mock session manager
vi.mock("../../../../src/browser/stagehand/sessionManager", () => ({
	BrowserbaseSessionManager: class MockSessionManager {
		getOrCreateSession = mockGetOrCreateSession;
		closeSession = mockCloseSession;
		getDebugUrl = mockGetDebugUrl;
	},
}));

// Mock stagehand LLM
vi.mock("../../../../src/llm/stagehandLlm", () => ({
	createStagehandLlmClient: vi.fn().mockResolvedValue({}),
	getLlmModelName: vi.fn().mockReturnValue("gemini-2.5-flash"),
}));

// Mock grammarly task
vi.mock("../../../../src/browser/stagehand/grammarlyTask", () => ({
	runStagehandGrammarlyTask: (...args: unknown[]) => mockRunStagehandGrammarlyTask(...args),
}));

// Import after mocking
import { StagehandProvider } from "../../../../src/browser/stagehand/index";

const baseConfig: AppConfig = {
	browserProvider: "stagehand",
	browserUseApiKey: undefined,
	browserUseProfileId: undefined,
	browserbaseApiKey: "test-api-key",
	browserbaseProjectId: "test-project-id",
	browserbaseSessionId: undefined,
	browserbaseContextId: undefined,
	stagehandModel: "gemini-2.5-flash",
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

describe("StagehandProvider", () => {
	beforeEach(() => {
		mockGetOrCreateSession.mockResolvedValue({
			sessionId: "bb-session-123",
			contextId: "ctx-456",
			liveUrl: "https://browserbase.url",
		});
		mockStagehandInit.mockResolvedValue(undefined);
		mockGetDebugUrl.mockResolvedValue("https://debug.url");
		mockCloseSession.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("sets providerName to stagehand", () => {
			const provider = new StagehandProvider(baseConfig);
			expect(provider.providerName).toBe("stagehand");
		});
	});

	describe("createSession", () => {
		it("creates a Browserbase session via session manager", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();

			expect(mockGetOrCreateSession).toHaveBeenCalled();
		});

		it("passes contextId from config to session manager", async () => {
			const config = { ...baseConfig, browserbaseContextId: "my-context" };
			const provider = new StagehandProvider(config);
			await provider.createSession();

			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					contextId: "my-context",
				})
			);
		});

		it("ignores proxyCountryCode option (not supported)", async () => {
			// proxyCountryCode is accepted in the interface but not passed to session manager
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({ proxyCountryCode: "UK" });

			// Should be called without proxyCountry since it was removed from session options
			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({ contextId: undefined })
			);

			// Ensure no proxy-related fields were forwarded
			const callArg = mockGetOrCreateSession.mock.calls[0]?.[0] ?? {};
			expect(callArg).not.toHaveProperty("proxyCountryCode");
		});

		it("initializes Stagehand instance", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();

			expect(mockStagehandInit).toHaveBeenCalled();
		});

		it("returns session result with debug URL", async () => {
			const provider = new StagehandProvider(baseConfig);
			const result = await provider.createSession();

			expect(result).toEqual({
				sessionId: "bb-session-123",
				liveUrl: "https://debug.url",
				contextId: "ctx-456",
			});
		});

		it("falls back to session liveUrl when debug URL not available", async () => {
			mockGetDebugUrl.mockResolvedValue(null);

			const provider = new StagehandProvider(baseConfig);
			const result = await provider.createSession();

			expect(result.liveUrl).toBe("https://browserbase.url");
		});

		it("closes Browserbase session and throws when Stagehand init fails", async () => {
			mockStagehandInit.mockRejectedValueOnce(new Error("Init failed"));

			const provider = new StagehandProvider(baseConfig);

			await expect(provider.createSession()).rejects.toThrow("Init failed");
			expect(mockCloseSession).toHaveBeenCalledWith("bb-session-123");
		});
	});

	describe("scoreText", () => {
		beforeEach(() => {
			mockRunStagehandGrammarlyTask.mockResolvedValue({
				aiDetectionPercent: 15,
				plagiarismPercent: 3,
				notes: "Scored",
			});
		});

		it("throws when no Stagehand instance exists for session", async () => {
			const provider = new StagehandProvider(baseConfig);

			await expect(
				provider.scoreText("unknown-session", "Text")
			).rejects.toThrow("No Stagehand instance found for session: unknown-session");
		});

		it("calls runStagehandGrammarlyTask with correct parameters", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			await provider.scoreText("bb-session-123", "Test text");

			expect(mockRunStagehandGrammarlyTask).toHaveBeenCalledWith(
				expect.anything(), // stagehand instance
				"Test text",
				{}
			);
		});

		it("passes score options to task", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			await provider.scoreText("bb-session-123", "Text", {
				maxSteps: 100,
				iteration: 3,
				mode: "analyze",
			});

			expect(mockRunStagehandGrammarlyTask).toHaveBeenCalledWith(
				expect.anything(),
				"Text",
				{
					maxSteps: 100,
					iteration: 3,
					mode: "analyze",
				}
			);
		});

		it("returns score result with debug URL", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			const result = await provider.scoreText("bb-session-123", "Text");

			expect(result).toEqual({
				aiDetectionPercent: 15,
				plagiarismPercent: 3,
				notes: "Scored",
				liveUrl: "https://debug.url",
			});
		});
	});

	describe("closeSession", () => {
		it("closes Stagehand instance when exists", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			await provider.closeSession("bb-session-123");

			expect(mockStagehandClose).toHaveBeenCalled();
		});

		it("closes Browserbase session via session manager", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			await provider.closeSession("bb-session-123");

			expect(mockCloseSession).toHaveBeenCalledWith("bb-session-123");
		});

		it("does not throw when Stagehand close fails", async () => {
			mockStagehandClose.mockRejectedValueOnce(new Error("Close failed"));

			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();

			await expect(
				provider.closeSession("bb-session-123")
			).resolves.not.toThrow();
		});

		it("still closes Browserbase session when Stagehand close fails", async () => {
			mockStagehandClose.mockRejectedValueOnce(new Error("Close failed"));

			const provider = new StagehandProvider(baseConfig);
			await provider.createSession();
			await provider.closeSession("bb-session-123");

			expect(mockCloseSession).toHaveBeenCalledWith("bb-session-123");
		});

		it("handles closing non-existent session gracefully", async () => {
			const provider = new StagehandProvider(baseConfig);

			await expect(
				provider.closeSession("non-existent")
			).resolves.not.toThrow();
			expect(mockCloseSession).toHaveBeenCalledWith("non-existent");
		});
	});
});
