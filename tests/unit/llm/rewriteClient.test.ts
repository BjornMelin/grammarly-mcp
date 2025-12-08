import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/config";
import {
	type RewriteParams,
	analyzeText,
	chooseClaudeModel,
	detectRewriteProvider,
	RewriterToneSchema,
	rewriteText,
	summarizeOptimization,
} from "../../../src/llm/rewriteClient";

// Mock the AI SDK
vi.mock("ai", () => ({
	generateObject: vi.fn(),
	generateText: vi.fn(),
}));

// Mock the claude-code provider
vi.mock("ai-sdk-provider-claude-code", () => ({
	claudeCode: vi.fn().mockReturnValue({ modelId: "claude-code-mock" }),
}));

// Mock the openai provider
vi.mock("@ai-sdk/openai", () => ({
	openai: vi.fn().mockReturnValue({ modelId: "openai-mock" }),
}));

// Mock the google provider
vi.mock("@ai-sdk/google", () => ({
	google: vi.fn().mockReturnValue({ modelId: "google-mock" }),
}));

// Mock the anthropic provider
vi.mock("@ai-sdk/anthropic", () => ({
	anthropic: vi.fn().mockReturnValue({ modelId: "anthropic-mock" }),
}));

// Import mocked modules
import { generateObject, generateText } from "ai";

const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;
const mockGenerateText = generateText as ReturnType<typeof vi.fn>;

// Base test config
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
	claudeApiKey: undefined,
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

describe("detectRewriteProvider", () => {
	it("returns claude-code when no API keys or explicit provider set", () => {
		expect(detectRewriteProvider(baseConfig)).toBe("claude-code");
	});

	it("returns explicit rewriteLlmProvider when set", () => {
		const config = { ...baseConfig, rewriteLlmProvider: "google" as const };
		expect(detectRewriteProvider(config)).toBe("google");
	});

	it("explicit provider overrides API key detection", () => {
		const config = {
			...baseConfig,
			rewriteLlmProvider: "claude-code" as const,
			openaiApiKey: "test-key", // Would normally trigger openai
		};
		expect(detectRewriteProvider(config)).toBe("claude-code");
	});

	it("returns openai when openaiApiKey is set", () => {
		const config = { ...baseConfig, openaiApiKey: "sk-test" };
		expect(detectRewriteProvider(config)).toBe("openai");
	});

	it("returns google when googleApiKey is set", () => {
		const config = { ...baseConfig, googleApiKey: "google-key" };
		expect(detectRewriteProvider(config)).toBe("google");
	});

	it("returns anthropic when anthropicApiKey is set", () => {
		const config = { ...baseConfig, anthropicApiKey: "sk-ant-test" };
		expect(detectRewriteProvider(config)).toBe("anthropic");
	});

	it("returns anthropic when claudeApiKey is set", () => {
		const config = { ...baseConfig, claudeApiKey: "sk-ant-test" };
		expect(detectRewriteProvider(config)).toBe("anthropic");
	});

	it("prioritizes openai over google and anthropic", () => {
		const config = {
			...baseConfig,
			openaiApiKey: "sk-openai",
			googleApiKey: "google-key",
			anthropicApiKey: "sk-anthropic",
		};
		expect(detectRewriteProvider(config)).toBe("openai");
	});

	it("prioritizes google over anthropic", () => {
		const config = {
			...baseConfig,
			googleApiKey: "google-key",
			anthropicApiKey: "sk-anthropic",
		};
		expect(detectRewriteProvider(config)).toBe("google");
	});
});

describe("chooseClaudeModel", () => {
	describe("with forced model", () => {
		it("returns forced haiku regardless of text length", () => {
			expect(chooseClaudeModel(50000, 10, "haiku")).toBe("haiku");
		});

		it("returns forced opus for short text", () => {
			expect(chooseClaudeModel(100, 1, "opus")).toBe("opus");
		});

		it("returns forced sonnet regardless of conditions", () => {
			expect(chooseClaudeModel(50000, 10, "sonnet")).toBe("sonnet");
		});

		it("auto mode uses existing heuristics for short text", () => {
			expect(chooseClaudeModel(100, 1, "auto")).toBe("haiku");
		});

		it("auto mode uses existing heuristics for long text", () => {
			expect(chooseClaudeModel(50000, 10, "auto")).toBe("opus");
		});
	});

	describe("selects haiku for", () => {
		it.each([
			["short text, few iterations", 2000, 2],
			["minimum values", 1, 1],
			["boundary text below 3000", 2999, 3],
			["short text, single iteration", 1500, 1],
		])("%s (%d chars, %d iterations)", (_, textLength, iterations) => {
			expect(chooseClaudeModel(textLength, iterations)).toBe("haiku");
		});
	});

	describe("selects sonnet for", () => {
		it.each([
			["moderate text, few iterations", 5000, 5],
			["boundary text length", 12000, 5],
			["boundary iterations", 5000, 8],
			["both at boundary", 12000, 8],
			["short text but many iterations", 2500, 4],
			["at 3000 chars threshold", 3000, 3],
			["typical essay", 8000, 3],
		])("%s (%d chars, %d iterations)", (_, textLength, iterations) => {
			expect(chooseClaudeModel(textLength, iterations)).toBe("sonnet");
		});
	});

	describe("selects opus for", () => {
		it.each([
			["text just over threshold", 12001, 5],
			["iterations just over threshold", 5000, 9],
			["both over threshold", 15000, 10],
			["very long text", 20000, 3],
			["many iterations", 5000, 15],
			["extreme values", 50000, 20],
		])("%s (%d chars, %d iterations)", (_, textLength, iterations) => {
			expect(chooseClaudeModel(textLength, iterations)).toBe("opus");
		});
	});

	describe("boundary conditions", () => {
		it("2999 chars with 3 iterations returns haiku", () => {
			expect(chooseClaudeModel(2999, 3)).toBe("haiku");
		});

		it("3000 chars returns sonnet (haiku threshold)", () => {
			expect(chooseClaudeModel(3000, 3)).toBe("sonnet");
		});

		it("2999 chars with 4 iterations returns sonnet (iterations exceed haiku)", () => {
			expect(chooseClaudeModel(2999, 4)).toBe("sonnet");
		});

		it("12000 chars returns sonnet", () => {
			expect(chooseClaudeModel(12000, 5)).toBe("sonnet");
		});

		it("12001 chars returns opus", () => {
			expect(chooseClaudeModel(12001, 5)).toBe("opus");
		});

		it("8 iterations returns sonnet", () => {
			expect(chooseClaudeModel(5000, 8)).toBe("sonnet");
		});

		it("9 iterations returns opus", () => {
			expect(chooseClaudeModel(5000, 9)).toBe("opus");
		});
	});
});

describe("RewriterToneSchema", () => {
	const validTones = ["neutral", "formal", "informal", "academic", "custom"] as const;

	it.each(validTones)("accepts '%s' tone", (tone) => {
		const result = RewriterToneSchema.safeParse(tone);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(tone);
		}
	});

	it.each([
		"professional",
		"casual",
		"business",
		"",
		"NEUTRAL",
		123,
		null,
		undefined,
	])("rejects invalid value: %s", (invalidTone) => {
		const result = RewriterToneSchema.safeParse(invalidTone);
		expect(result.success).toBe(false);
	});
});

describe("rewriteText", () => {
	const baseParams: RewriteParams = {
		originalText: "This is some text that needs rewriting.",
		lastAiPercent: 45,
		lastPlagiarismPercent: 12,
		targetMaxAiPercent: 10,
		targetMaxPlagiarismPercent: 5,
		tone: "neutral",
		maxIterations: 5,
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe("successful rewrite", () => {
		it("returns rewritten text and reasoning", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: {
					rewrittenText: "Rewritten content here.",
					reasoning: "Made it more human-like.",
				},
			});

			const result = await rewriteText(baseConfig, baseParams);

			expect(result).toEqual({
				rewrittenText: "Rewritten content here.",
				reasoning: "Made it more human-like.",
			});
			expect(mockGenerateObject).toHaveBeenCalledTimes(1);
		});

		it.each([
			["neutral", "Use a neutral tone that feels like a human wrote it."],
			["formal", "Use a formal tone that feels like a human wrote it."],
			["informal", "Use an informal tone that feels like a human wrote it."],
			["academic", "Use an academic tone that feels like a human wrote it."],
			["custom", "Use a natural human tone guided by the custom instructions."],
		] as const)("handles %s tone", async (tone, expectedToneText) => {
			mockGenerateObject.mockResolvedValueOnce({
				object: {
					rewrittenText: "Text",
					reasoning: "Reason",
				},
			});

			await rewriteText(baseConfig, { ...baseParams, tone });

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain(expectedToneText);
		});

		it("includes domain hint when provided", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, {
				...baseParams,
				domainHint: "academic research",
			});

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("Domain: academic research.");
		});

		it("includes custom instructions when provided", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, {
				...baseParams,
				customInstructions: "Keep technical terms intact",
			});

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("Additional constraints from the user: Keep technical terms intact");
		});
	});

	describe("null score handling", () => {
		it("formats null AI score as unavailable", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, {
				...baseParams,
				lastAiPercent: null,
			});

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("The last AI detection score was unavailable.");
		});

		it("formats null plagiarism score as unavailable", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, {
				...baseParams,
				lastPlagiarismPercent: null,
			});

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("The last plagiarism / originality score was unavailable.");
		});

		it("formats numeric scores with percentage", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, baseParams);

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("approximately 45%");
			expect(call.prompt).toContain("approximately 12%");
		});
	});

	describe("timeout handling", () => {
		it("clears timeout on successful response", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { rewrittenText: "Text", reasoning: "Reason" },
			});

			await rewriteText(baseConfig, baseParams);

			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe("error handling", () => {
		it("wraps API errors with context", async () => {
			mockGenerateObject.mockRejectedValueOnce(new Error("API rate limit exceeded"));

			await expect(rewriteText(baseConfig, baseParams)).rejects.toThrow(
				"Rewrite failed: API rate limit exceeded"
			);
		});

		it("handles non-Error exceptions", async () => {
			mockGenerateObject.mockRejectedValueOnce("String error");

			await expect(rewriteText(baseConfig, baseParams)).rejects.toThrow(
				"Rewrite failed: String error"
			);
		});
	});
});

describe("analyzeText", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe("successful analysis", () => {
		it("returns analysis string", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: {
					analysis: "Text shows AI patterns in formal sentence structure.",
				},
			});

			const result = await analyzeText(
				baseConfig,
				"Test text",
				25,
				5,
				10,
				5,
				"neutral"
			);

			expect(result).toBe("Text shows AI patterns in formal sentence structure.");
		});

		it("includes domain hint when provided", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { analysis: "Analysis result" },
			});

			await analyzeText(
				baseConfig,
				"Test text",
				25,
				5,
				10,
				5,
				"academic",
				"scientific paper"
			);

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("Domain: scientific paper");
		});
	});

	describe("null score handling", () => {
		it("formats null AI score as unknown", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { analysis: "Analysis" },
			});

			await analyzeText(baseConfig, "Text", null, 5, 10, 5, "neutral");

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("Current Grammarly AI detection score is unknown (not available).");
		});

		it("formats null plagiarism score as unknown", async () => {
			mockGenerateObject.mockResolvedValueOnce({
				object: { analysis: "Analysis" },
			});

			await analyzeText(baseConfig, "Text", 25, null, 10, 5, "neutral");

			const call = mockGenerateObject.mock.calls[0][0];
			expect(call.prompt).toContain("Current Grammarly plagiarism / originality score is unknown (not available).");
		});
	});

	describe("error handling", () => {
		it("wraps API errors with context", async () => {
			mockGenerateObject.mockRejectedValueOnce(new Error("Network error"));

			await expect(
				analyzeText(baseConfig, "Text", 25, 5, 10, 5, "neutral")
			).rejects.toThrow("Analysis failed: Network error");
		});
	});
});

describe("summarizeOptimization", () => {
	const baseSummaryInput = {
		mode: "optimize" as const,
		iterationsUsed: 3,
		thresholdsMet: true,
		history: [
			{ iteration: 0, ai_detection_percent: 45, plagiarism_percent: 12, note: "Initial scoring" },
			{ iteration: 1, ai_detection_percent: 25, plagiarism_percent: 8, note: "First rewrite" },
			{ iteration: 2, ai_detection_percent: 8, plagiarism_percent: 3, note: "Second rewrite" },
		],
		finalText: "Final optimized text content.",
		maxAiPercent: 10,
		maxPlagiarismPercent: 5,
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe("successful summary", () => {
		it("returns summary text", async () => {
			mockGenerateText.mockResolvedValueOnce({
				text: "Optimization completed successfully. AI detection reduced from 45% to 8%.",
			});

			const result = await summarizeOptimization(baseConfig, baseSummaryInput);

			expect(result).toBe("Optimization completed successfully. AI detection reduced from 45% to 8%.");
			expect(mockGenerateText).toHaveBeenCalledTimes(1);
		});

		it.each([
			["score_only", "Mode: score_only"],
			["analyze", "Mode: analyze"],
			["optimize", "Mode: optimize"],
		] as const)("includes mode %s in prompt", async (mode, expectedText) => {
			mockGenerateText.mockResolvedValueOnce({ text: "Summary" });

			await summarizeOptimization(baseConfig, {
				...baseSummaryInput,
				mode,
			});

			const call = mockGenerateText.mock.calls[0][0];
			expect(call.prompt).toContain(expectedText);
		});

		it("includes history as JSON in prompt", async () => {
			mockGenerateText.mockResolvedValueOnce({ text: "Summary" });

			await summarizeOptimization(baseConfig, baseSummaryInput);

			const call = mockGenerateText.mock.calls[0][0];
			expect(call.prompt).toContain("History entries:");
			expect(call.prompt).toContain('"iteration": 0');
		});

		it("handles empty history", async () => {
			mockGenerateText.mockResolvedValueOnce({ text: "Summary" });

			await summarizeOptimization(baseConfig, {
				...baseSummaryInput,
				history: [],
			});

			expect(mockGenerateText).toHaveBeenCalledTimes(1);
		});

		it("truncates long final text to 4000 chars", async () => {
			mockGenerateText.mockResolvedValueOnce({ text: "Summary" });

			const longText = "x".repeat(5000);
			await summarizeOptimization(baseConfig, {
				...baseSummaryInput,
				finalText: longText,
			});

			const call = mockGenerateText.mock.calls[0][0];
			expect(call.prompt.length).toBeLessThan(longText.length + 1000);
		});
	});

	describe("error handling", () => {
		it("wraps API errors with context", async () => {
			mockGenerateText.mockRejectedValueOnce(new Error("Server error"));

			await expect(
				summarizeOptimization(baseConfig, baseSummaryInput)
			).rejects.toThrow("Optimization summary failed: Server error");
		});

		it("handles non-Error exceptions", async () => {
			mockGenerateText.mockRejectedValueOnce({ code: 500, message: "Internal error" });

			await expect(
				summarizeOptimization(baseConfig, baseSummaryInput)
			).rejects.toThrow("Optimization summary failed:");
		});
	});
});
