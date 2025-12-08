import { describe, expect, it } from "vitest";
import type { GrammarlyOptimizeResult } from "../../src/grammarlyOptimizer";
import { formatAsMarkdown } from "../../src/server";

describe("formatAsMarkdown", () => {
	const baseResult: GrammarlyOptimizeResult = {
		final_text: "Optimized text content",
		ai_detection_percent: 8,
		plagiarism_percent: 2,
		thresholds_met: true,
		iterations_used: 2,
		notes: "Optimization completed successfully",
		history: [],
		live_url: null,
	};

	describe("basic formatting", () => {
		it("includes status emoji for thresholds met", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("✅");
		});

		it("includes warning emoji when thresholds not met", () => {
			const result = formatAsMarkdown({
				...baseResult,
				thresholds_met: false,
			});
			expect(result).toContain("⚠️");
		});

		it("formats AI detection percentage", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("| AI Detection | 8% |");
		});

		it("formats plagiarism percentage", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("| Plagiarism | 2% |");
		});

		it("includes iterations used", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("| Iterations Used | 2 |");
		});

		it("includes notes section", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("## Notes");
			expect(result).toContain("Optimization completed successfully");
		});

		it("includes final text in code block", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("## Final Text");
			expect(result).toContain("```");
			expect(result).toContain("Optimized text content");
		});
	});

	describe("null score handling", () => {
		it("displays N/A for null AI detection", () => {
			const result = formatAsMarkdown({
				...baseResult,
				ai_detection_percent: null,
			});
			expect(result).toContain("| AI Detection | N/A |");
		});

		it("displays N/A for null plagiarism", () => {
			const result = formatAsMarkdown({
				...baseResult,
				plagiarism_percent: null,
			});
			expect(result).toContain("| Plagiarism | N/A |");
		});

		it("displays N/A for both null scores", () => {
			const result = formatAsMarkdown({
				...baseResult,
				ai_detection_percent: null,
				plagiarism_percent: null,
			});
			expect(result).toContain("| AI Detection | N/A |");
			expect(result).toContain("| Plagiarism | N/A |");
		});
	});

	describe("live URL handling", () => {
		it("includes live preview link when URL provided", () => {
			const result = formatAsMarkdown({
				...baseResult,
				live_url: "https://example.com/session/123",
			});
			expect(result).toContain("| Live Preview |");
			expect(result).toContain("[Browser Session](https://example.com/session/123)");
		});

		it("omits live preview row when URL is null", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).not.toContain("Live Preview");
		});
	});

	describe("iteration history", () => {
		it("omits history section when empty", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).not.toContain("## Iteration History");
		});

		it("includes history table when entries exist", () => {
			const result = formatAsMarkdown({
				...baseResult,
				history: [
					{
						iteration: 1,
						ai_detection_percent: 25,
						plagiarism_percent: 5,
						note: "Initial scoring",
					},
					{
						iteration: 2,
						ai_detection_percent: 8,
						plagiarism_percent: 2,
						note: "After rewrite",
					},
				],
			});
			expect(result).toContain("## Iteration History");
			expect(result).toContain("| Iteration | AI % | Plagiarism % | Note |");
			expect(result).toContain("| 1 | 25% | 5% | Initial scoring |");
			expect(result).toContain("| 2 | 8% | 2% | After rewrite |");
		});

		it("handles null scores in history", () => {
			const result = formatAsMarkdown({
				...baseResult,
				history: [
					{
						iteration: 1,
						ai_detection_percent: null,
						plagiarism_percent: null,
						note: "Premium unavailable",
					},
				],
			});
			expect(result).toContain("| 1 | N/A | N/A | Premium unavailable |");
		});

		it("truncates long notes to 60 characters", () => {
			const longNote = "This is a very long note that exceeds sixty characters and should be truncated";
			const result = formatAsMarkdown({
				...baseResult,
				history: [
					{
						iteration: 1,
						ai_detection_percent: 10,
						plagiarism_percent: 3,
						note: longNote,
					},
				],
			});
			// Should truncate to 57 chars + "..."
			// "This is a very long note that exceeds sixty characters an" = 57 chars
			expect(result).toContain("This is a very long note that exceeds sixty characters an...");
			expect(result).not.toContain(longNote);
		});

		it("keeps short notes as-is", () => {
			const shortNote = "Short note";
			const result = formatAsMarkdown({
				...baseResult,
				history: [
					{
						iteration: 1,
						ai_detection_percent: 10,
						plagiarism_percent: 3,
						note: shortNote,
					},
				],
			});
			expect(result).toContain(`| ${shortNote} |`);
		});
	});

	describe("markdown structure", () => {
		it("starts with header", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result.startsWith("# Grammarly Optimization Result")).toBe(true);
		});

		it("includes summary section", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("## Summary");
		});

		it("includes table formatting", () => {
			const result = formatAsMarkdown(baseResult);
			expect(result).toContain("| Metric | Value |");
			expect(result).toContain("|--------|-------|");
		});

		it("ends with final text code block", () => {
			const result = formatAsMarkdown(baseResult);
			const lines = result.trim().split("\n");
			expect(lines[lines.length - 1]).toBe("```");
		});
	});

	describe("edge cases", () => {
		it("handles zero scores", () => {
			const result = formatAsMarkdown({
				...baseResult,
				ai_detection_percent: 0,
				plagiarism_percent: 0,
			});
			expect(result).toContain("| AI Detection | 0% |");
			expect(result).toContain("| Plagiarism | 0% |");
		});

		it("handles 100% scores", () => {
			const result = formatAsMarkdown({
				...baseResult,
				ai_detection_percent: 100,
				plagiarism_percent: 100,
			});
			expect(result).toContain("| AI Detection | 100% |");
			expect(result).toContain("| Plagiarism | 100% |");
		});

		it("handles zero iterations", () => {
			const result = formatAsMarkdown({
				...baseResult,
				iterations_used: 0,
			});
			expect(result).toContain("| Iterations Used | 0 |");
		});

		it("handles empty notes", () => {
			const result = formatAsMarkdown({
				...baseResult,
				notes: "",
			});
			expect(result).toContain("## Notes");
		});

		it("handles empty final text", () => {
			const result = formatAsMarkdown({
				...baseResult,
				final_text: "",
			});
			expect(result).toContain("## Final Text");
			expect(result).toContain("```\n\n```");
		});

		it("handles special characters in text", () => {
			const result = formatAsMarkdown({
				...baseResult,
				final_text: "Text with `backticks` and | pipes | and **markdown**",
			});
			expect(result).toContain("Text with `backticks` and | pipes | and **markdown**");
		});
	});
});
