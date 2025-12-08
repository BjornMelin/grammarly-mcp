import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LogLevel, log } from "../../src/config";

describe("log", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe("log level filtering", () => {
		// The config is loaded at module init with LOG_LEVEL=error from setup.ts
		// So only error level should pass through

		it("filters out debug messages when log level is error", () => {
			log("debug", "debug message");
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});

		it("filters out info messages when log level is error", () => {
			log("info", "info message");
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});

		it("filters out warn messages when log level is error", () => {
			log("warn", "warn message");
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});

		it("allows error messages when log level is error", () => {
			log("error", "error message");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[grammarly-mcp:error]",
				"error message",
			);
		});
	});

	describe("output format", () => {
		it("includes level prefix in output", () => {
			log("error", "test message");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[grammarly-mcp:error]",
				"test message",
			);
		});

		it("includes extra data when provided", () => {
			const extra = { key: "value", count: 42 };
			log("error", "test message", extra);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[grammarly-mcp:error]",
				"test message",
				extra,
			);
		});

		it("omits extra parameter when undefined", () => {
			log("error", "test message", undefined);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[grammarly-mcp:error]",
				"test message",
			);
		});
	});

	describe("writes to stderr", () => {
		it("uses console.error for output", () => {
			log("error", "stderr test");
			expect(consoleErrorSpy).toHaveBeenCalled();
		});
	});
});

describe("log level hierarchy", () => {
	// These tests document the expected log level ordering
	const levels: LogLevel[] = ["debug", "info", "warn", "error"];

	it.each([
		["debug", 0],
		["info", 1],
		["warn", 2],
		["error", 3],
	] as const)("%s has index %d in hierarchy", (level, expectedIndex) => {
		expect(levels.indexOf(level)).toBe(expectedIndex);
	});

	it("levels array has correct order for filtering", () => {
		expect(levels).toEqual(["debug", "info", "warn", "error"]);
	});
});
