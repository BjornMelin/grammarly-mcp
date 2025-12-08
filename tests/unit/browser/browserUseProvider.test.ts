import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/config";

// Create mock functions at top level
const mockCreateBrowserUseClient = vi.fn();
const mockCreateGrammarlySession = vi.fn();
const mockRunGrammarlyScoreTask = vi.fn();
const mockDeleteSession = vi.fn();

// Mock the grammarlyTask module
vi.mock("../../../src/browser/grammarlyTask", () => ({
	createBrowserUseClient: (...args: unknown[]) => mockCreateBrowserUseClient(...args),
	createGrammarlySession: (...args: unknown[]) => mockCreateGrammarlySession(...args),
	runGrammarlyScoreTask: (...args: unknown[]) => mockRunGrammarlyScoreTask(...args),
}));

// Import after mocking
import { BrowserUseProvider } from "../../../src/browser/browserUseProvider";

const baseConfig: AppConfig = {
	ignoreSystemEnv: false,
	browserProvider: "browser-use",
	browserUseApiKey: "test-browser-use-key",
	browserUseProfileId: "test-profile-id",
	browserbaseApiKey: undefined,
	browserbaseProjectId: undefined,
	browserbaseSessionId: undefined,
	browserbaseContextId: undefined,
	stagehandModel: "gemini-2.5-flash",
	stagehandCacheDir: undefined,
	stagehandLlmProvider: undefined,
	rewriteLlmProvider: undefined,
	claudeModel: "auto",
	openaiModel: "gpt-4o",
	googleModel: "gemini-2.5-flash",
	claudeApiKey: "test-claude-key",
	openaiApiKey: undefined,
	googleApiKey: undefined,
	anthropicApiKey: undefined,
	claudeRequestTimeoutMs: 120000,
	connectTimeoutMs: 30000,
	logLevel: "error",
	browserUseDefaultTimeoutMs: 300000,
	defaultMaxAiPercent: 10,
	defaultMaxPlagiarismPercent: 5,
	defaultMaxIterations: 5,
};

describe("BrowserUseProvider", () => {
	const mockClient = {
		sessions: {
			deleteSession: mockDeleteSession,
		},
	};

	beforeEach(() => {
		mockCreateBrowserUseClient.mockReturnValue(mockClient);
		mockDeleteSession.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("sets providerName to browser-use", () => {
			const provider = new BrowserUseProvider(baseConfig);
			expect(provider.providerName).toBe("browser-use");
		});
	});

	describe("createSession", () => {
		it("creates a client lazily on first call", async () => {
			mockCreateGrammarlySession.mockResolvedValueOnce({
				sessionId: "session-123",
				liveUrl: "https://live.url",
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();

			expect(mockCreateBrowserUseClient).toHaveBeenCalledWith(baseConfig);
		});

		it("reuses the same client on subsequent calls", async () => {
			mockCreateGrammarlySession.mockResolvedValue({
				sessionId: "session-123",
				liveUrl: null,
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			await provider.createSession();

			expect(mockCreateBrowserUseClient).toHaveBeenCalledTimes(1);
		});

		it("passes proxy options to session creation", async () => {
			mockCreateGrammarlySession.mockResolvedValueOnce({
				sessionId: "session-123",
				liveUrl: null,
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession({ proxyCountryCode: "US" });

			expect(mockCreateGrammarlySession).toHaveBeenCalledWith(
				mockClient,
				baseConfig,
				{ proxyCountryCode: "US" }
			);
		});

		it("returns session result with sessionId and liveUrl", async () => {
			mockCreateGrammarlySession.mockResolvedValueOnce({
				sessionId: "my-session",
				liveUrl: "https://preview.url",
			});

			const provider = new BrowserUseProvider(baseConfig);
			const result = await provider.createSession();

			expect(result).toEqual({
				sessionId: "my-session",
				liveUrl: "https://preview.url",
			});
		});
	});

	describe("scoreText", () => {
		beforeEach(() => {
			mockCreateGrammarlySession.mockResolvedValue({
				sessionId: "session-123",
				liveUrl: "https://live.url",
			});
		});

		it("calls runGrammarlyScoreTask with correct parameters", async () => {
			mockRunGrammarlyScoreTask.mockResolvedValueOnce({
				aiDetectionPercent: 15,
				plagiarismPercent: 3,
				notes: "Scored successfully",
				liveUrl: null,
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			await provider.scoreText("session-123", "Test text content");

			expect(mockRunGrammarlyScoreTask).toHaveBeenCalledWith(
				mockClient,
				"session-123",
				"Test text content",
				baseConfig,
				expect.objectContaining({
					llm: "browser-use-llm",
					flashMode: false,
				}),
				"https://live.url"
			);
		});

		it("passes score options correctly", async () => {
			mockRunGrammarlyScoreTask.mockResolvedValueOnce({
				aiDetectionPercent: 10,
				plagiarismPercent: 5,
				notes: "Test",
				liveUrl: null,
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			await provider.scoreText("session-123", "Text", {
				maxSteps: 50,
				iteration: 2,
				mode: "optimize",
				flashMode: true,
			});

			expect(mockRunGrammarlyScoreTask).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.objectContaining({
					maxSteps: 50,
					iteration: 2,
					mode: "optimize",
					flashMode: true,
				}),
				expect.anything()
			);
		});

		it("returns score result with all fields", async () => {
			mockRunGrammarlyScoreTask.mockResolvedValueOnce({
				aiDetectionPercent: 25,
				plagiarismPercent: 8,
				notes: "High AI detection",
				liveUrl: "https://result.url",
			});

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			const result = await provider.scoreText("session-123", "Text");

			expect(result).toEqual({
				aiDetectionPercent: 25,
				plagiarismPercent: 8,
				notes: "High AI detection",
				liveUrl: "https://result.url",
			});
		});

		it("handles null liveUrl for unknown sessions", async () => {
			mockRunGrammarlyScoreTask.mockResolvedValueOnce({
				aiDetectionPercent: 10,
				plagiarismPercent: 5,
				notes: "Test",
				liveUrl: null,
			});

			const provider = new BrowserUseProvider(baseConfig);
			// Don't create session first - directly score with unknown session
			await provider.scoreText("unknown-session", "Text");

			// liveUrl should be null since session wasn't tracked
			expect(mockRunGrammarlyScoreTask).toHaveBeenCalledWith(
				expect.anything(),
				"unknown-session",
				"Text",
				expect.anything(),
				expect.anything(),
				null
			);
		});
	});

	describe("closeSession", () => {
		beforeEach(() => {
			mockCreateGrammarlySession.mockResolvedValue({
				sessionId: "session-to-close",
				liveUrl: null,
			});
		});

		it("calls deleteSession on the client", async () => {
			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			await provider.closeSession("session-to-close");

			expect(mockDeleteSession).toHaveBeenCalledWith({
				session_id: "session-to-close",
			});
		});

		it("removes session from activeSessions map", async () => {
			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();
			await provider.closeSession("session-to-close");

			// After closing, the session should not be in the map
			mockRunGrammarlyScoreTask.mockResolvedValueOnce({
				aiDetectionPercent: 10,
				plagiarismPercent: 5,
				notes: "Test",
				liveUrl: null,
			});

			await provider.scoreText("session-to-close", "Text");

			// liveUrl should be null since session was removed
			expect(mockRunGrammarlyScoreTask).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				null
			);
		});

		it("does not throw when deleteSession fails", async () => {
			mockDeleteSession.mockRejectedValueOnce(new Error("Delete failed"));

			const provider = new BrowserUseProvider(baseConfig);
			await provider.createSession();

			// Should not throw
			await expect(
				provider.closeSession("session-to-close")
			).resolves.not.toThrow();
		});
	});
});
