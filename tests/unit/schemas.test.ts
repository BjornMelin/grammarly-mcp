import { describe, expect, it } from "vitest";
import { ToolInputSchema, ToolOutputSchema } from "../../src/grammarlyOptimizer";
import {
	GrammarlyExtractSchema,
	ObservationSchema,
} from "../../src/browser/stagehand/schemas";
import { RewriterToneSchema } from "../../src/llm/rewriteClient";

describe("ToolInputSchema", () => {
	describe("valid inputs", () => {
		it.each([
			["minimal valid", { text: "sample" }],
			["with mode", { text: "sample", mode: "optimize" }],
			["score_only mode", { text: "sample", mode: "score_only" }],
			["analyze mode", { text: "sample", mode: "analyze" }],
			["with thresholds", { text: "sample", max_ai_percent: 10, max_plagiarism_percent: 5 }],
			["with iterations", { text: "sample", max_iterations: 5 }],
			["with tone", { text: "sample", tone: "formal" }],
			["with domain hint", { text: "sample", domain_hint: "university essay" }],
			["with custom instructions", { text: "sample", custom_instructions: "preserve citations" }],
			["with proxy country", { text: "sample", proxy_country_code: "us" }],
			["with response format json", { text: "sample", response_format: "json" }],
			["with response format markdown", { text: "sample", response_format: "markdown" }],
			["with max steps", { text: "sample", max_steps: 50 }],
			["full valid input", {
				text: "sample text",
				mode: "optimize",
				max_ai_percent: 15,
				max_plagiarism_percent: 10,
				max_iterations: 3,
				tone: "academic",
				domain_hint: "research paper",
				custom_instructions: "keep code blocks intact",
				proxy_country_code: "gb",
				response_format: "markdown",
				max_steps: 25,
			}],
		])("%s", (_, input) => {
			const result = ToolInputSchema.safeParse(input);
			expect(result.success).toBe(true);
		});
	});

	describe("invalid inputs", () => {
		it.each([
			["missing text", { mode: "optimize" }],
			["empty text", { text: "" }],
			["invalid mode", { text: "x", mode: "invalid" }],
			["ai percent > 100", { text: "x", max_ai_percent: 101 }],
			["ai percent < 0", { text: "x", max_ai_percent: -1 }],
			["plagiarism percent > 100", { text: "x", max_plagiarism_percent: 101 }],
			["plagiarism percent < 0", { text: "x", max_plagiarism_percent: -1 }],
			["iterations > 20", { text: "x", max_iterations: 21 }],
			["iterations < 1", { text: "x", max_iterations: 0 }],
			["invalid tone", { text: "x", tone: "invalid_tone" }],
			["proxy code too long", { text: "x", proxy_country_code: "usa" }],
			["proxy code too short", { text: "x", proxy_country_code: "u" }],
			["invalid response format", { text: "x", response_format: "xml" }],
			["max steps < 5", { text: "x", max_steps: 4 }],
			["max steps > 100", { text: "x", max_steps: 101 }],
		])("%s", (_, input) => {
			const result = ToolInputSchema.safeParse(input);
			expect(result.success).toBe(false);
		});
	});

	describe("boundary values", () => {
		it.each([
			["ai percent = 0", { text: "x", max_ai_percent: 0 }, true],
			["ai percent = 100", { text: "x", max_ai_percent: 100 }, true],
			["plagiarism percent = 0", { text: "x", max_plagiarism_percent: 0 }, true],
			["plagiarism percent = 100", { text: "x", max_plagiarism_percent: 100 }, true],
			["iterations = 1", { text: "x", max_iterations: 1 }, true],
			["iterations = 20", { text: "x", max_iterations: 20 }, true],
			["max steps = 5", { text: "x", max_steps: 5 }, true],
			["max steps = 100", { text: "x", max_steps: 100 }, true],
		])("%s", (_, input, shouldPass) => {
			const result = ToolInputSchema.safeParse(input);
			expect(result.success).toBe(shouldPass);
		});
	});

	describe("default values", () => {
		it("applies defaults when not provided", () => {
			const result = ToolInputSchema.parse({ text: "sample" });
			expect(result.mode).toBe("optimize");
			expect(result.max_ai_percent).toBe(10);
			expect(result.max_plagiarism_percent).toBe(5);
			expect(result.max_iterations).toBe(5);
			expect(result.tone).toBe("neutral");
			expect(result.response_format).toBe("json");
		});
	});
});

describe("ToolOutputSchema", () => {
	it("accepts valid output", () => {
		const validOutput = {
			final_text: "optimized text",
			ai_detection_percent: 5,
			plagiarism_percent: 2,
			iterations_used: 3,
			thresholds_met: true,
			history: [
				{ iteration: 0, ai_detection_percent: 45, plagiarism_percent: 12, note: "baseline" },
				{ iteration: 1, ai_detection_percent: 20, plagiarism_percent: 5, note: "first pass" },
			],
			notes: "Optimization successful",
		};
		const result = ToolOutputSchema.safeParse(validOutput);
		expect(result.success).toBe(true);
	});

	it("accepts null scores", () => {
		const outputWithNulls = {
			final_text: "text",
			ai_detection_percent: null,
			plagiarism_percent: null,
			iterations_used: 0,
			thresholds_met: false,
			history: [],
			notes: "No scores available",
		};
		const result = ToolOutputSchema.safeParse(outputWithNulls);
		expect(result.success).toBe(true);
	});

	it("accepts optional live_url", () => {
		const outputWithLiveUrl = {
			final_text: "text",
			ai_detection_percent: 10,
			plagiarism_percent: 5,
			iterations_used: 1,
			thresholds_met: true,
			history: [],
			notes: "Done",
			live_url: "https://debug.browserbase.io/session123",
		};
		const result = ToolOutputSchema.safeParse(outputWithLiveUrl);
		expect(result.success).toBe(true);
	});
});

describe("GrammarlyExtractSchema", () => {
	it("accepts valid scores", () => {
		const result = GrammarlyExtractSchema.safeParse({
			aiDetectionPercent: 15,
			plagiarismPercent: 3,
			notes: "Scores extracted successfully",
		});
		expect(result.success).toBe(true);
	});

	it("accepts null scores", () => {
		const result = GrammarlyExtractSchema.safeParse({
			aiDetectionPercent: null,
			plagiarismPercent: null,
			notes: "Premium features unavailable",
		});
		expect(result.success).toBe(true);
	});

	it("accepts optional overallScore", () => {
		const result = GrammarlyExtractSchema.safeParse({
			aiDetectionPercent: 10,
			plagiarismPercent: 5,
			overallScore: 85,
			notes: "All scores present",
		});
		expect(result.success).toBe(true);
	});

	it.each([
		["ai percent > 100", { aiDetectionPercent: 101, plagiarismPercent: 0, notes: "x" }],
		["ai percent < 0", { aiDetectionPercent: -1, plagiarismPercent: 0, notes: "x" }],
		["plagiarism percent > 100", { aiDetectionPercent: 0, plagiarismPercent: 101, notes: "x" }],
		["plagiarism percent < 0", { aiDetectionPercent: 0, plagiarismPercent: -1, notes: "x" }],
		["missing notes", { aiDetectionPercent: 0, plagiarismPercent: 0 }],
	])("rejects %s", (_, input) => {
		const result = GrammarlyExtractSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});

describe("ObservationSchema", () => {
	it("accepts valid observation", () => {
		const result = ObservationSchema.safeParse({
			selector: ".new-document-button",
			description: "Button to create new document",
			visible: true,
			interactable: true,
		});
		expect(result.success).toBe(true);
	});

	it("rejects missing fields", () => {
		const result = ObservationSchema.safeParse({
			selector: ".button",
			description: "A button",
		});
		expect(result.success).toBe(false);
	});
});

describe("RewriterToneSchema", () => {
	it.each([
		["neutral", "neutral"],
		["formal", "formal"],
		["informal", "informal"],
		["academic", "academic"],
		["custom", "custom"],
	])("accepts %s tone", (_, tone) => {
		const result = RewriterToneSchema.safeParse(tone);
		expect(result.success).toBe(true);
	});

	it("rejects invalid tone", () => {
		const result = RewriterToneSchema.safeParse("professional");
		expect(result.success).toBe(false);
	});
});
