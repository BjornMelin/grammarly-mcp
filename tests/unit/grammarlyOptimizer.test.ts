import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config";

// Mock functions at top level
const mockCreateBrowserProvider = vi.fn();
const mockProviderCreateSession = vi.fn();
const mockProviderScoreText = vi.fn();
const mockProviderCloseSession = vi.fn();
const mockRewriteText = vi.fn();
const mockAnalyzeText = vi.fn();
const mockSummarizeOptimization = vi.fn();

// Mock the browser provider module
vi.mock("../../src/browser/provider", () => ({
	createBrowserProvider: (...args: unknown[]) => mockCreateBrowserProvider(...args),
}));

// Mock the rewrite client module
vi.mock("../../src/llm/rewriteClient", () => ({
	rewriteText: (...args: unknown[]) => mockRewriteText(...args),
	analyzeText: (...args: unknown[]) => mockAnalyzeText(...args),
	summarizeOptimization: (...args: unknown[]) =>
		mockSummarizeOptimization(...args),
	RewriterToneSchema: {
		default: vi.fn().mockReturnThis(),
		describe: vi.fn().mockReturnThis(),
	},
}));

// Mock config for logging
vi.mock("../../src/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/config")>();
	return {
		...actual,
		log: vi.fn(),
	};
});

// Import after mocking
import {
	type GrammarlyScores,
	runGrammarlyOptimization,
	thresholdsMet,
	withRetry,
	type GrammarlyOptimizeInput,
} from "../../src/grammarlyOptimizer";

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
};

const baseInput: GrammarlyOptimizeInput = {
	text: "Sample text to optimize",
	mode: "score_only",
	max_ai_percent: 10,
	max_plagiarism_percent: 5,
	max_iterations: 5,
	tone: "neutral",
	response_format: "json",
};

describe("thresholdsMet", () => {
	describe("both scores available", () => {
		it.each<[string, GrammarlyScores, number, number, boolean]>([
			[
				"both below thresholds",
				{ aiDetectionPercent: 5, plagiarismPercent: 2 },
				10,
				5,
				true,
			],
			[
				"both at thresholds",
				{ aiDetectionPercent: 10, plagiarismPercent: 5 },
				10,
				5,
				true,
			],
			[
				"ai above threshold",
				{ aiDetectionPercent: 15, plagiarismPercent: 2 },
				10,
				5,
				false,
			],
			[
				"plagiarism above threshold",
				{ aiDetectionPercent: 5, plagiarismPercent: 10 },
				10,
				5,
				false,
			],
			[
				"both above thresholds",
				{ aiDetectionPercent: 15, plagiarismPercent: 10 },
				10,
				5,
				false,
			],
			["zero scores", { aiDetectionPercent: 0, plagiarismPercent: 0 }, 10, 5, true],
			[
				"max thresholds",
				{ aiDetectionPercent: 100, plagiarismPercent: 100 },
				100,
				100,
				true,
			],
		])("%s", (_, scores, maxAi, maxPlag, expected) => {
			expect(thresholdsMet(scores, maxAi, maxPlag)).toBe(expected);
		});
	});

	describe("null scores", () => {
		it("treats null AI score as passing", () => {
			const scores: GrammarlyScores = { aiDetectionPercent: null, plagiarismPercent: 2 };
			expect(thresholdsMet(scores, 10, 5)).toBe(true);
		});

		it("treats null plagiarism score as passing", () => {
			const scores: GrammarlyScores = { aiDetectionPercent: 5, plagiarismPercent: null };
			expect(thresholdsMet(scores, 10, 5)).toBe(true);
		});

		it("returns false when both scores are null", () => {
			const scores: GrammarlyScores = {
				aiDetectionPercent: null,
				plagiarismPercent: null,
			};
			expect(thresholdsMet(scores, 10, 5)).toBe(false);
		});

		it("still checks available score when other is null", () => {
			const scoresAiFailing: GrammarlyScores = {
				aiDetectionPercent: 15,
				plagiarismPercent: null,
			};
			expect(thresholdsMet(scoresAiFailing, 10, 5)).toBe(false);

			const scoresPlagFailing: GrammarlyScores = {
				aiDetectionPercent: null,
				plagiarismPercent: 10,
			};
			expect(thresholdsMet(scoresPlagFailing, 10, 5)).toBe(false);
		});
	});
});

describe("withRetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns immediately on success", async () => {
		const fn = vi.fn().mockResolvedValue("success");

		const resultPromise = withRetry(fn, { maxRetries: 3, backoffMs: 100 });
		const result = await resultPromise;

		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries on failure then succeeds", async () => {
		const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

		const resultPromise = withRetry(fn, { maxRetries: 3, backoffMs: 100 });

		// Advance past the first backoff delay
		await vi.advanceTimersByTimeAsync(100);

		const result = await resultPromise;
		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("uses exponential backoff", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockResolvedValue("success");

		const resultPromise = withRetry(fn, { maxRetries: 3, backoffMs: 100 });

		// First retry: 100ms
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(2);

		// Second retry: 200ms (100 * 2^1)
		await vi.advanceTimersByTimeAsync(200);
		expect(fn).toHaveBeenCalledTimes(3);

		const result = await resultPromise;
		expect(result).toBe("success");
	});

	it("throws after max retries exhausted", async () => {
		const error = new Error("persistent failure");
		const fn = vi.fn().mockImplementation(() => Promise.reject(error));

		// We need to ensure the promise rejection is handled before timers advance
		let caughtError: Error | undefined;

		const resultPromise = withRetry(fn, { maxRetries: 2, backoffMs: 100 }).catch(
			(e: Error) => {
				caughtError = e;
			}
		);

		// Advance all timers to complete all retries
		await vi.runAllTimersAsync();

		// Wait for the catch handler to execute
		await resultPromise;

		expect(caughtError).toBeDefined();
		expect(caughtError?.message).toBe("persistent failure");
		expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
	});

	it("preserves error type from non-Error throws", async () => {
		const fn = vi.fn().mockRejectedValue("string error");

		const resultPromise = withRetry(fn, { maxRetries: 0, backoffMs: 100 });

		await expect(resultPromise).rejects.toBe("string error");
	});

	it("works with zero retries", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("fail"));

		const resultPromise = withRetry(fn, { maxRetries: 0, backoffMs: 100 });

		await expect(resultPromise).rejects.toThrow("fail");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("accepts optional label for debugging", async () => {
		const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

		const resultPromise = withRetry(fn, {
			maxRetries: 1,
			backoffMs: 100,
			label: "testOperation",
		});

		await vi.advanceTimersByTimeAsync(100);
		const result = await resultPromise;

		expect(result).toBe("success");
	});

	it("throws RangeError for negative maxRetries", async () => {
		const fn = vi.fn().mockResolvedValue("success");

		await expect(withRetry(fn, { maxRetries: -1, backoffMs: 100 })).rejects.toThrow(
			RangeError
		);
	});
});

describe("runGrammarlyOptimization", () => {
	const mockProvider = {
		providerName: "stagehand" as const,
		createSession: mockProviderCreateSession,
		scoreText: mockProviderScoreText,
		closeSession: mockProviderCloseSession,
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Default successful mocks
		mockCreateBrowserProvider.mockResolvedValue(mockProvider);
		mockProviderCreateSession.mockResolvedValue({
			sessionId: "test-session-123",
			liveUrl: "https://live.url",
		});
		mockProviderScoreText.mockResolvedValue({
			aiDetectionPercent: 15,
			plagiarismPercent: 3,
			notes: "Scores extracted",
		});
		mockProviderCloseSession.mockResolvedValue(undefined);
		mockRewriteText.mockResolvedValue({
			rewrittenText: "Rewritten text",
			reasoning: "Made text more human-like",
		});
		mockAnalyzeText.mockResolvedValue("Analysis: Text appears AI-generated");
		mockSummarizeOptimization.mockResolvedValue("Optimization summary");
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("score_only mode", () => {
		it("returns scores without rewriting", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Below thresholds",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.final_text).toBe(baseInput.text);
			expect(result.ai_detection_percent).toBe(8);
			expect(result.plagiarism_percent).toBe(2);
			expect(result.iterations_used).toBe(0);
			expect(result.thresholds_met).toBe(true);
			expect(mockRewriteText).not.toHaveBeenCalled();
		});

		it("reports thresholds not met for high scores", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 50,
				plagiarismPercent: 20,
				notes: "High AI detection",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.thresholds_met).toBe(false);
			expect(result.notes).toContain("thresholds not met");
		});

		it("includes live_url in result", async () => {
			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.live_url).toBe("https://live.url");
		});

		it("includes provider name in result", async () => {
			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.provider).toBe("stagehand");
		});
	});

	describe("analyze mode", () => {
		it("returns analysis from Claude", async () => {
			mockAnalyzeText.mockResolvedValue(
				"Analysis: High AI detection, consider rewriting"
			);

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "analyze",
			});

			expect(result.notes).toBe("Analysis: High AI detection, consider rewriting");
			expect(mockAnalyzeText).toHaveBeenCalled();
			expect(mockRewriteText).not.toHaveBeenCalled();
		});

		it("includes scores in result", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 25,
				plagiarismPercent: 5,
				notes: "Moderate AI",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "analyze",
			});

			expect(result.ai_detection_percent).toBe(25);
			expect(result.plagiarism_percent).toBe(5);
		});

		it("passes tone and domain_hint to analysis", async () => {
			await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "analyze",
				tone: "academic",
				domain_hint: "university essay",
			});

			expect(mockAnalyzeText).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.anything(),
				"academic",
				"university essay"
			);
		});
	});

	describe("optimize mode", () => {
		it("iterates until thresholds met", async () => {
			mockProviderScoreText
				.mockResolvedValueOnce({
					aiDetectionPercent: 50,
					plagiarismPercent: 3,
					notes: "Initial high AI",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 25,
					plagiarismPercent: 3,
					notes: "Still high",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 8,
					plagiarismPercent: 2,
					notes: "Below threshold",
				});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "optimize",
				max_iterations: 5,
			});

			expect(result.thresholds_met).toBe(true);
			expect(result.iterations_used).toBe(2); // Stopped early
			expect(mockRewriteText).toHaveBeenCalledTimes(2);
		});

		it("stops at max_iterations if thresholds never met", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 50,
				plagiarismPercent: 10,
				notes: "High scores persist",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "optimize",
				max_iterations: 3,
			});

			expect(result.thresholds_met).toBe(false);
			expect(result.iterations_used).toBe(3);
			expect(mockRewriteText).toHaveBeenCalledTimes(3);
		});

		it("uses rewritten text for subsequent iterations", async () => {
			mockRewriteText
				.mockResolvedValueOnce({
					rewrittenText: "First rewrite",
					reasoning: "Step 1",
				})
				.mockResolvedValueOnce({
					rewrittenText: "Second rewrite",
					reasoning: "Step 2",
				});

			mockProviderScoreText
				.mockResolvedValueOnce({
					aiDetectionPercent: 50,
					plagiarismPercent: 3,
					notes: "Initial",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 30,
					plagiarismPercent: 3,
					notes: "After first",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 8,
					plagiarismPercent: 2,
					notes: "Success",
				});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "optimize",
				max_iterations: 5,
			});

			expect(result.final_text).toBe("Second rewrite");
		});

		it("builds history with all iterations", async () => {
			mockProviderScoreText
				.mockResolvedValueOnce({
					aiDetectionPercent: 50,
					plagiarismPercent: 5,
					notes: "Initial",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 8,
					plagiarismPercent: 2,
					notes: "Final",
				});

			mockRewriteText.mockResolvedValue({
				rewrittenText: "Optimized",
				reasoning: "Improved text",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "optimize",
				max_iterations: 5,
			});

			expect(result.history).toHaveLength(2); // iteration 0 + iteration 1
			expect(result.history[0].iteration).toBe(0);
			expect(result.history[1].iteration).toBe(1);
		});

		it("generates summary via Claude", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success on first try",
			});
			mockSummarizeOptimization.mockResolvedValue(
				"Optimization completed successfully"
			);

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "optimize",
			});

			expect(result.notes).toBe("Optimization completed successfully");
			expect(mockSummarizeOptimization).toHaveBeenCalled();
		});
	});

	describe("progress callback", () => {
		it("calls progress callback at each stage", async () => {
			const onProgress = vi.fn().mockResolvedValue(undefined);
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			await runGrammarlyOptimization(
				baseConfig,
				{
					...baseInput,
					mode: "score_only",
				},
				onProgress
			);

			expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("Creating"), 5);
			expect(onProgress).toHaveBeenCalledWith(
				expect.stringContaining("initial Grammarly"),
				10
			);
			expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("complete"), 100);
		});

		it("reports progress during optimization iterations", async () => {
			const onProgress = vi.fn().mockResolvedValue(undefined);
			mockProviderScoreText
				.mockResolvedValueOnce({
					aiDetectionPercent: 50,
					plagiarismPercent: 3,
					notes: "Initial",
				})
				.mockResolvedValueOnce({
					aiDetectionPercent: 8,
					plagiarismPercent: 2,
					notes: "Final",
				});

			await runGrammarlyOptimization(
				baseConfig,
				{
					...baseInput,
					mode: "optimize",
					max_iterations: 5,
				},
				onProgress
			);

			expect(onProgress).toHaveBeenCalledWith(
				expect.stringContaining("Iteration 1"),
				expect.any(Number)
			);
		});
	});

	describe("session management", () => {
		it("closes session in finally block on success", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			await runGrammarlyOptimization(baseConfig, baseInput);

			expect(mockProviderCloseSession).toHaveBeenCalledWith("test-session-123");
		});

		it("closes session in finally block on error", async () => {
			// Mock to fail 3 times (initial + 2 retries) to exhaust withRetry
			mockProviderScoreText.mockRejectedValue(new Error("Scoring failed"));

			// Use fake timers to handle retry backoff delays
			vi.useFakeTimers();

			// Attach catch handler immediately to prevent unhandled rejection
			let caughtError: Error | undefined;
			const promise = runGrammarlyOptimization(baseConfig, baseInput).catch((e: Error) => {
				caughtError = e;
			});

			// Advance through all retry delays
			await vi.runAllTimersAsync();

			// Wait for catch handler to complete
			await promise;

			vi.useRealTimers();

			expect(caughtError).toBeDefined();
			expect(caughtError?.message).toBe("Scoring failed");
			expect(mockProviderCloseSession).toHaveBeenCalledWith("test-session-123");
		});

		it("handles closeSession failure gracefully", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});
			mockProviderCloseSession.mockRejectedValue(new Error("Close failed"));

			// Should not throw despite closeSession failure
			const result = await runGrammarlyOptimization(baseConfig, baseInput);

			expect(result).toBeDefined();
			expect(mockProviderCloseSession).toHaveBeenCalled();
		});

		it("adds login guidance to history when needsLogin is true with debugUrl", async () => {
			mockProviderCreateSession.mockResolvedValue({
				sessionId: "new-session",
				liveUrl: "https://live.url",
				contextId: "ctx-123",
				needsLogin: true,
				debugUrl: "https://debug.browserbase.com/session/abc",
			});
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			// Should have login guidance in history (iteration -1)
			const loginEntry = result.history.find((h) => h.iteration === -1);
			expect(loginEntry).toBeDefined();
			expect(loginEntry?.note).toContain("https://debug.browserbase.com/session/abc");
			expect(loginEntry?.note).toContain("BROWSERBASE_CONTEXT_ID=ctx-123");
		});

		it("adds login guidance with liveUrl fallback when debugUrl not available", async () => {
			mockProviderCreateSession.mockResolvedValue({
				sessionId: "new-session",
				liveUrl: "https://live.fallback.url",
				contextId: "ctx-456",
				needsLogin: true,
				// No debugUrl - should fall back to liveUrl
			});
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			const loginEntry = result.history.find((h) => h.iteration === -1);
			expect(loginEntry).toBeDefined();
			expect(loginEntry?.note).toContain("https://live.fallback.url");
			expect(loginEntry?.note).toContain("BROWSERBASE_CONTEXT_ID=ctx-456");
		});

		it("uses your-context-id placeholder when contextId not available", async () => {
			mockProviderCreateSession.mockResolvedValue({
				sessionId: "new-session",
				liveUrl: "https://live.url",
				needsLogin: true,
				// No contextId
			});
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			const loginEntry = result.history.find((h) => h.iteration === -1);
			expect(loginEntry).toBeDefined();
			expect(loginEntry?.note).toContain("BROWSERBASE_CONTEXT_ID=your-context-id");
		});

		it("does not add login guidance when needsLogin is false", async () => {
			mockProviderCreateSession.mockResolvedValue({
				sessionId: "existing-session",
				liveUrl: "https://live.url",
				contextId: "ctx-789",
				needsLogin: false,
			});
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 8,
				plagiarismPercent: 2,
				notes: "Success",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			// Should NOT have login guidance (no iteration -1)
			const loginEntry = result.history.find((h) => h.iteration === -1);
			expect(loginEntry).toBeUndefined();
		});
	});

	describe("error handling", () => {
		it("retries provider creation on failure", async () => {
			mockCreateBrowserProvider
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValue(mockProvider);

			vi.useFakeTimers();
			const promise = runGrammarlyOptimization(baseConfig, baseInput);
			await vi.runAllTimersAsync();
			vi.useRealTimers();

			const result = await promise;
			expect(result).toBeDefined();
			expect(mockCreateBrowserProvider).toHaveBeenCalledTimes(2);
		});

		it("retries session creation on failure", async () => {
			mockProviderCreateSession
				.mockRejectedValueOnce(new Error("Session error"))
				.mockResolvedValue({
					sessionId: "retry-session",
					liveUrl: "https://retry.url",
				});

			vi.useFakeTimers();
			const promise = runGrammarlyOptimization(baseConfig, baseInput);
			await vi.runAllTimersAsync();
			vi.useRealTimers();

			const result = await promise;
			expect(result).toBeDefined();
			expect(mockProviderCreateSession).toHaveBeenCalledTimes(2);
		});

		it("retries scoring on failure", async () => {
			mockProviderScoreText
				.mockRejectedValueOnce(new Error("Scoring error"))
				.mockResolvedValue({
					aiDetectionPercent: 8,
					plagiarismPercent: 2,
					notes: "Success after retry",
				});

			vi.useFakeTimers();
			const promise = runGrammarlyOptimization(baseConfig, baseInput);
			await vi.runAllTimersAsync();
			vi.useRealTimers();

			const result = await promise;
			expect(result).toBeDefined();
			expect(mockProviderScoreText).toHaveBeenCalledTimes(2);
		});
	});

	describe("null score handling", () => {
		it("handles null AI detection score", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: null,
				plagiarismPercent: 3,
				notes: "AI detection unavailable",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.ai_detection_percent).toBeNull();
			expect(result.thresholds_met).toBe(true); // null treated as passing
		});

		it("handles null plagiarism score", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: 5,
				plagiarismPercent: null,
				notes: "Plagiarism check unavailable",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.plagiarism_percent).toBeNull();
			expect(result.thresholds_met).toBe(true);
		});

		it("handles both scores null", async () => {
			mockProviderScoreText.mockResolvedValue({
				aiDetectionPercent: null,
				plagiarismPercent: null,
				notes: "Premium features unavailable",
			});

			const result = await runGrammarlyOptimization(baseConfig, {
				...baseInput,
				mode: "score_only",
			});

			expect(result.thresholds_met).toBe(false); // Can't verify with no scores
		});
	});
});
