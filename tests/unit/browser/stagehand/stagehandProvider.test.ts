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
	GrammarlyAuthError: class GrammarlyAuthError extends Error {
		readonly debugUrl: string | undefined;
		constructor(message: string, debugUrl?: string) {
			super(message);
			this.name = "GrammarlyAuthError";
			this.debugUrl = debugUrl;
		}
	},
	checkGrammarlyAuthStatus: vi.fn().mockResolvedValue({ loggedIn: true, currentUrl: "" }),
}));

// Import after mocking
import { StagehandProvider } from "../../../../src/browser/stagehand/index";

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

		it("passes proxy and stealth options to session manager", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({
				proxyCountry: "UK",
				proxyEnabled: true,
				advancedStealth: true,
				blockAds: false,
			});

			// Session options should be passed through to session manager
			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					proxyCountry: "UK",
					proxyEnabled: true,
					advancedStealth: true,
					blockAds: false,
				})
			);
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
				needsLogin: undefined,
				debugUrl: "https://debug.url",
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
				expect.objectContaining({
					debugUrl: "https://debug.url",
				})
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
				expect.objectContaining({
					maxSteps: 100,
					iteration: 3,
					mode: "analyze",
					debugUrl: "https://debug.url",
				})
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

	describe("BYOP (Bring Your Own Proxy) passthrough", () => {
		it("passes BYOP options to session manager", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({
				proxyEnabled: true,
				proxyType: "external",
				proxyServer: "http://geo.iproyal.com:12321",
				proxyUsername: "iproyal_user",
				proxyPassword: "iproyal_pass_country-us",
			});

			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					proxyEnabled: true,
					proxyType: "external",
					proxyServer: "http://geo.iproyal.com:12321",
					proxyUsername: "iproyal_user",
					proxyPassword: "iproyal_pass_country-us",
				})
			);
		});

		it("passes browserbase proxy options to session manager", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({
				proxyEnabled: true,
				proxyType: "browserbase",
				proxyCountry: "GB",
			});

			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					proxyEnabled: true,
					proxyType: "browserbase",
					proxyCountry: "GB",
				})
			);
		});

		it("passes all session options including BYOP fields", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({
				advancedStealth: true,
				blockAds: true,
				solveCaptchas: true,
				viewport: { width: 1920, height: 1080 },
				proxyEnabled: true,
				proxyType: "external",
				proxyServer: "http://proxy.example.com:8080",
				proxyUsername: "user",
				proxyPassword: "pass",
			});

			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					advancedStealth: true,
					blockAds: true,
					solveCaptchas: true,
					viewport: { width: 1920, height: 1080 },
					proxyEnabled: true,
					proxyType: "external",
					proxyServer: "http://proxy.example.com:8080",
					proxyUsername: "user",
					proxyPassword: "pass",
				})
			);
		});

		it("does not apply proxy settings when proxyEnabled is false", async () => {
			const provider = new StagehandProvider(baseConfig);
			await provider.createSession({
				proxyEnabled: false,
				proxyType: "external",
				proxyServer: "http://proxy.example.com:8080",
				proxyUsername: "user",
				proxyPassword: "pass",
				proxyCountry: "US",
			});

			expect(mockGetOrCreateSession).toHaveBeenCalledWith(
				expect.objectContaining({
					proxyEnabled: false,
					proxyType: undefined,
					proxyServer: undefined,
					proxyUsername: undefined,
					proxyPassword: undefined,
					proxyCountry: undefined,
				})
			);
		});
	});
});
