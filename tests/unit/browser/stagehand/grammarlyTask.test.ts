import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module for logging
vi.mock("../../../../src/config", () => ({
	log: vi.fn(),
}));

// Mock the setTimeout to prevent actual delays
// Using fake timers with sleep() requires advancing timers in each test
// Instead, immediately invoke callbacks for test speed without test modifications
vi.stubGlobal(
	"setTimeout",
	vi.fn((cb: () => void) => {
		cb();
		return 0 as unknown as NodeJS.Timeout;
	})
);

// Mock functions at top level
const mockPageUrl = vi.fn();
const mockPageGoto = vi.fn();
const mockPageEvaluate = vi.fn();
const mockStagehandObserve = vi.fn();
const mockStagehandAct = vi.fn();
const mockStagehandExtract = vi.fn();

// Mock for waitForLoadState
const mockWaitForLoadState = vi.fn();

// Create mock page factory
function createMockPage(url = "https://other-site.com") {
	return {
		url: mockPageUrl.mockReturnValue(url),
		goto: mockPageGoto,
		evaluate: mockPageEvaluate,
		waitForLoadState: mockWaitForLoadState.mockResolvedValue(undefined),
		locator: vi.fn().mockReturnValue({
			fill: vi.fn().mockResolvedValue(undefined),
		}),
	};
}

// Create mock Stagehand factory
function createMockStagehand(pages: unknown[] = [createMockPage()]) {
	return {
		context: {
			pages: vi.fn().mockReturnValue(pages),
		},
		observe: mockStagehandObserve,
		act: mockStagehandAct,
		extract: mockStagehandExtract,
	};
}

// Import after mocking (the module uses named imports)
import type { Stagehand } from "@browserbasehq/stagehand";
import {
	checkGrammarlyAuthStatus,
	cleanupGrammarlyDocument,
	GrammarlyAuthError,
	runStagehandGrammarlyTask,
} from "../../../../src/browser/stagehand/grammarlyTask";

describe("runStagehandGrammarlyTask", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default successful mocks
		mockPageGoto.mockResolvedValue(undefined);
		mockPageEvaluate.mockResolvedValue(undefined);
		mockWaitForLoadState.mockResolvedValue(undefined);
		// Default observe returns auth indicators first, then new document button, then AI detection
		mockStagehandObserve
			.mockResolvedValueOnce([{ description: "User profile avatar" }]) // Auth check
			.mockResolvedValueOnce([{ description: "New document button" }]) // New doc
			.mockResolvedValueOnce([{ description: "AI detection" }]); // AI detection
		mockStagehandAct.mockResolvedValue(undefined);
		mockStagehandExtract.mockResolvedValue({
			aiDetectionPercent: 15,
			plagiarismPercent: 3,
			overallScore: 85,
			notes: "Scores extracted successfully",
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("page retrieval", () => {
		it("throws error when no page available in context", async () => {
			const stagehand = createMockStagehand([]);

			await expect(
				runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test text")
			).rejects.toThrow("No page available in Stagehand context");
		});

		it("uses first page from context", async () => {
			const mockPage = createMockPage("https://app.grammarly.com/docs/123");
			const stagehand = createMockStagehand([mockPage]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test text");

			expect(mockPageUrl).toHaveBeenCalled();
		});
	});

	describe("text handling", () => {
		it("processes text longer than 8000 characters", async () => {
			const longText = "a".repeat(10000);
			const mockFill = vi.fn().mockResolvedValue(undefined);
			const mockPage = {
				...createMockPage("https://app.grammarly.com"),
				locator: vi.fn().mockReturnValue({
					fill: mockFill,
				}),
			};
			const stagehand = createMockStagehand([mockPage]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, longText);

			// Verify text was truncated to MAX_TEXT_LENGTH (8000) before fill
			expect(mockPage.locator).toHaveBeenCalledWith('[contenteditable="true"]');
			expect(mockFill).toHaveBeenCalledTimes(1);
			expect(mockFill.mock.calls[0][0]).toHaveLength(8000);
			expect(mockFill.mock.calls[0][0]).toBe("a".repeat(8000));
		});

		it("processes short text correctly", async () => {
			const shortText = "Short test text";
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, shortText);

			// Verify the exact text is used for short texts (<=500 chars get typed directly)
			const actCalls = mockStagehandAct.mock.calls;
			const typeCall = actCalls.find(
				(call) => typeof call[0] === "string" && call[0].includes(shortText)
			);
			expect(typeCall).toBeDefined();
		});
	});

	describe("navigation", () => {
		it("navigates to Grammarly when not already there", async () => {
			const mockPage = createMockPage("https://other-site.com");
			const stagehand = createMockStagehand([mockPage]);

			// After goto(), mock should return the Grammarly URL so auth check passes
			mockPageGoto.mockImplementation(async () => {
				mockPageUrl.mockReturnValue("https://app.grammarly.com");
			});

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			expect(mockPageGoto).toHaveBeenCalledWith("https://app.grammarly.com", {
				waitUntil: "networkidle",
			});
		});

		it("skips navigation when already on Grammarly", async () => {
			const mockPage = createMockPage("https://app.grammarly.com/docs/123");
			const stagehand = createMockStagehand([mockPage]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			expect(mockPageGoto).not.toHaveBeenCalled();
		});
	});

	describe("observe-then-act pattern", () => {
		it("uses observed element when observation returns results", async () => {
			const observedElement = { description: "New document", selector: "#new-doc" };
			mockStagehandObserve.mockReset(); // Clear beforeEach mocks
			mockStagehandObserve
				.mockResolvedValueOnce([{ description: "User avatar" }]) // Auth check
				.mockResolvedValueOnce([observedElement]) // New doc observe
				.mockResolvedValueOnce([{ description: "AI detection" }]); // AI detection
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			// Should call act with the observed element
			expect(mockStagehandAct).toHaveBeenCalledWith(observedElement);
		});

		it("falls back to direct action when observation returns empty array", async () => {
			mockStagehandObserve.mockReset(); // Clear beforeEach mocks
			mockStagehandObserve
				.mockResolvedValueOnce([{ description: "User avatar" }]) // Auth check (logged in)
				.mockResolvedValueOnce([]) // New doc observe returns empty
				.mockResolvedValueOnce([{ description: "AI detection" }]); // AI detection
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			// Should call act with a string instruction as fallback
			expect(mockStagehandAct).toHaveBeenCalledWith(
				expect.stringContaining("Click on 'New'")
			);
		});

		it("falls back to direct action when first element is undefined", async () => {
			mockStagehandObserve.mockReset(); // Clear beforeEach mocks
			mockStagehandObserve
				.mockResolvedValueOnce([{ description: "User avatar" }]) // Auth check
				.mockResolvedValueOnce([undefined]) // New doc returns undefined element
				.mockResolvedValueOnce([{ description: "AI detection" }]); // AI detection
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			// Should call act with a string instruction as fallback
			expect(mockStagehandAct).toHaveBeenCalledWith(
				expect.stringContaining("Click on 'New'")
			);
		});
	});

	describe("text input", () => {
		it("types short text directly (<=500 chars)", async () => {
			const shortText = "Short text under 500 characters";
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, shortText);

			// Find the act call that types the text directly
			const actCalls = mockStagehandAct.mock.calls;
			const directTypeCall = actCalls.find(
				(call) =>
					typeof call[0] === "string" &&
					call[0].includes("Type the following text exactly:")
			);
			expect(directTypeCall).toBeDefined();
		});

		it("uses locator.fill() for long text (>500 chars)", async () => {
			const longText = "a".repeat(1200); // Long text triggers fill() approach
			const mockFill = vi.fn().mockResolvedValue(undefined);
			const mockPage = {
				...createMockPage("https://app.grammarly.com"),
				locator: vi.fn().mockReturnValue({
					fill: mockFill,
				}),
			};
			const stagehand = createMockStagehand([mockPage]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, longText);

			// Check that locator.fill() was called for long text
			expect(mockPage.locator).toHaveBeenCalledWith('[contenteditable="true"]');
			expect(mockFill).toHaveBeenCalledTimes(1);
			expect(mockFill.mock.calls[0][0]).toBe(longText);
		});

	});

	describe("AI detection observation", () => {
		it("uses observed AI detection element when found", async () => {
			const aiDetectElement = { description: "AI Detection button" };
			mockStagehandObserve.mockReset(); // Clear beforeEach mocks
			mockStagehandObserve
				.mockResolvedValueOnce([{ description: "User avatar" }]) // Auth check
				.mockResolvedValueOnce([{ description: "New document" }]) // New doc observe
				.mockResolvedValueOnce([aiDetectElement]); // AI detection observe

			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			expect(mockStagehandAct).toHaveBeenCalledWith(aiDetectElement);
		});

		it("falls back to direct action for AI detection when not observed", async () => {
			mockStagehandObserve.mockReset(); // Clear beforeEach mocks
			mockStagehandObserve
				.mockResolvedValueOnce([{ description: "User avatar" }]) // Auth check
				.mockResolvedValueOnce([{ description: "New document" }]) // New doc observe
				.mockResolvedValueOnce([]); // Empty AI detection observation

			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			expect(mockStagehandAct).toHaveBeenCalledWith(
				expect.stringContaining("Open the AI detection panel")
			);
		});
	});

	describe("score extraction", () => {
		it("returns extracted scores with all fields", async () => {
			mockStagehandExtract.mockResolvedValue({
				aiDetectionPercent: 25,
				plagiarismPercent: 8,
				overallScore: 90,
				notes: "All scores visible",
			});
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			const result = await runStagehandGrammarlyTask(
				stagehand as unknown as Stagehand,
				"Test"
			);

			expect(result).toEqual({
				aiDetectionPercent: 25,
				plagiarismPercent: 8,
				overallScore: 90,
				notes: "All scores visible",
			});
		});

		it("handles null scores when features unavailable", async () => {
			mockStagehandExtract.mockResolvedValue({
				aiDetectionPercent: null,
				plagiarismPercent: null,
				notes: "Premium features not available",
			});
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			const result = await runStagehandGrammarlyTask(
				stagehand as unknown as Stagehand,
				"Test"
			);

			expect(result.aiDetectionPercent).toBeNull();
			expect(result.plagiarismPercent).toBeNull();
			expect(result.notes).toContain("Premium");
		});

		it("calls extract with correct schema instruction", async () => {
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");

			expect(mockStagehandExtract).toHaveBeenCalledWith(
				expect.stringContaining("AI Detection Percentage"),
				expect.anything() // GrammarlyExtractSchema
			);
		});
	});

	describe("error handling", () => {
		it("attempts fallback extraction on primary extraction error", async () => {
			mockStagehandExtract
				.mockRejectedValueOnce(new Error("Primary extraction failed"))
				.mockResolvedValueOnce({
					aiDetectionPercent: 10,
					plagiarismPercent: 2,
					notes: "Fallback extraction",
				});
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			const result = await runStagehandGrammarlyTask(
				stagehand as unknown as Stagehand,
				"Test"
			);

			expect(result.notes).toContain("partial extraction");
			expect(mockStagehandExtract).toHaveBeenCalledTimes(2);
		});

		it("throws original error when fallback extraction also fails", async () => {
			const originalError = new Error("Primary extraction failed");
			mockStagehandExtract
				.mockRejectedValueOnce(originalError)
				.mockRejectedValueOnce(new Error("Fallback also failed"));
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await expect(
				runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test")
			).rejects.toThrow("Primary extraction failed");
		});

		it("throws GrammarlyAuthError with debugUrl when not logged in", async () => {
			// Mock observe to return empty (not logged in) for auth check
			mockStagehandObserve.mockReset();
			mockStagehandObserve.mockResolvedValue([]); // No auth indicators
			// Also make extraction fail so the auth error is re-thrown (not caught by fallback)
			mockStagehandExtract.mockReset();
			mockStagehandExtract.mockRejectedValue(new Error("Extraction failed"));

			const mockPage = createMockPage("https://app.grammarly.com/docs");
			const stagehand = createMockStagehand([mockPage]);

			await expect(
				runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test", {
					debugUrl: "https://debug.browserbase.com/session/123",
				})
			).rejects.toMatchObject({
				name: "GrammarlyAuthError",
				debugUrl: "https://debug.browserbase.com/session/123",
				message: expect.stringContaining("https://debug.browserbase.com/session/123"),
			});
		});

		it("throws GrammarlyAuthError without debugUrl when not logged in", async () => {
			mockStagehandObserve.mockReset();
			mockStagehandObserve.mockResolvedValue([]); // No auth indicators
			// Also make extraction fail so the auth error is re-thrown
			mockStagehandExtract.mockReset();
			mockStagehandExtract.mockRejectedValue(new Error("Extraction failed"));

			const mockPage = createMockPage("https://app.grammarly.com/docs");
			const stagehand = createMockStagehand([mockPage]);

			try {
				await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test");
				expect.fail("Expected GrammarlyAuthError to be thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(GrammarlyAuthError);
				expect((error as GrammarlyAuthError).debugUrl).toBeUndefined();
				expect((error as GrammarlyAuthError).message).toContain("BROWSERBASE_CONTEXT_ID");
			}
		});

		it("continues task when networkidle times out", async () => {
			// Mock waitForLoadState to reject (timeout)
			mockWaitForLoadState.mockRejectedValue(new Error("Timeout waiting for network idle"));
			const mockPage = createMockPage("https://app.grammarly.com/docs");
			const stagehand = createMockStagehand([mockPage]);

			// The task should still complete despite networkidle timeout
			const result = await runStagehandGrammarlyTask(
				stagehand as unknown as Stagehand,
				"Test"
			);

			// Should have called extract despite timeout
			expect(mockStagehandExtract).toHaveBeenCalled();
			expect(result).toBeDefined();
		});
	});

	describe("options handling", () => {
		it("logs iteration number when provided", async () => {
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test", {
				iteration: 3,
			});

			// Verify the function completed successfully with options
			expect(mockStagehandExtract).toHaveBeenCalled();
		});

		it("logs mode when provided", async () => {
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(stagehand as unknown as Stagehand, "Test", {
				mode: "analyze",
			});

			expect(mockStagehandExtract).toHaveBeenCalled();
		});

		it("handles undefined options", async () => {
			const stagehand = createMockStagehand([createMockPage("https://app.grammarly.com")]);

			await runStagehandGrammarlyTask(
				stagehand as unknown as Stagehand,
				"Test",
				undefined
			);

			expect(mockStagehandExtract).toHaveBeenCalled();
		});
	});
});

describe("checkGrammarlyAuthStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns loggedIn false when no page available", async () => {
		const stagehand = createMockStagehand([]);

		await expect(
			checkGrammarlyAuthStatus(stagehand as unknown as Stagehand)
		).rejects.toThrow("No page found in browser context");
	});

	it("returns loggedIn false when on signin page", async () => {
		const mockPage = createMockPage("https://app.grammarly.com/signin");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://app.grammarly.com/signin" });
	});

	it("returns loggedIn false when on login page", async () => {
		const mockPage = createMockPage("https://app.grammarly.com/login");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://app.grammarly.com/login" });
	});

	it("returns loggedIn false when on signup page", async () => {
		const mockPage = createMockPage("https://app.grammarly.com/signup");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://app.grammarly.com/signup" });
	});

	it("returns loggedIn true when auth indicators found on app page", async () => {
		mockStagehandObserve.mockResolvedValue([{ description: "User avatar" }]);
		const mockPage = createMockPage("https://app.grammarly.com/docs");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: true, currentUrl: "https://app.grammarly.com/docs" });
	});

	it("returns loggedIn false when no auth indicators found on app page", async () => {
		mockStagehandObserve.mockResolvedValue([]);
		const mockPage = createMockPage("https://app.grammarly.com/docs");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://app.grammarly.com/docs" });
	});

	it("returns loggedIn false when observe throws error on app page", async () => {
		mockStagehandObserve.mockRejectedValue(new Error("Observe failed"));
		const mockPage = createMockPage("https://app.grammarly.com/docs");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://app.grammarly.com/docs" });
	});

	it("returns loggedIn false when not on Grammarly yet", async () => {
		const mockPage = createMockPage("https://google.com");
		const stagehand = createMockStagehand([mockPage]);

		const result = await checkGrammarlyAuthStatus(stagehand as unknown as Stagehand);

		expect(result).toEqual({ loggedIn: false, currentUrl: "https://google.com" });
	});
});

describe("GrammarlyAuthError", () => {
	it("creates error with message and debugUrl", () => {
		const error = new GrammarlyAuthError("Login required", "https://debug.url");

		expect(error.name).toBe("GrammarlyAuthError");
		expect(error.message).toBe("Login required");
		expect(error.debugUrl).toBe("https://debug.url");
	});

	it("creates error with message only", () => {
		const error = new GrammarlyAuthError("Login required");

		expect(error.name).toBe("GrammarlyAuthError");
		expect(error.message).toBe("Login required");
		expect(error.debugUrl).toBeUndefined();
	});
});

describe("cleanupGrammarlyDocument", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls act to delete or close the document", async () => {
		mockStagehandAct.mockResolvedValue(undefined);
		const stagehand = createMockStagehand([createMockPage()]);

		await cleanupGrammarlyDocument(stagehand as unknown as Stagehand);

		expect(mockStagehandAct).toHaveBeenCalledWith(
			expect.stringContaining("Delete the current document")
		);
	});

	it("does not throw when cleanup fails", async () => {
		mockStagehandAct.mockRejectedValue(new Error("Cleanup failed"));
		const stagehand = createMockStagehand([createMockPage()]);

		// Should not throw
		await expect(
			cleanupGrammarlyDocument(stagehand as unknown as Stagehand)
		).resolves.not.toThrow();
	});

	it("completes silently on error", async () => {
		mockStagehandAct.mockRejectedValue(new Error("Cleanup failed"));
		const stagehand = createMockStagehand([createMockPage()]);

		const result = await cleanupGrammarlyDocument(stagehand as unknown as Stagehand);

		// Returns undefined (void function)
		expect(result).toBeUndefined();
	});
});
