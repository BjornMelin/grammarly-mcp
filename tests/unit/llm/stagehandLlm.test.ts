import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../../src/config";
import { detectLlmProvider, getLlmModelName } from "../../../src/llm/stagehandLlm";

describe("detectLlmProvider", () => {
	// Store original env values
	let originalAnthropicKey: string | undefined;
	let originalOpenaiKey: string | undefined;
	let originalGoogleKey: string | undefined;
	let originalGeminiKey: string | undefined;

	beforeEach(() => {
		// Save original values
		originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
		originalOpenaiKey = process.env.OPENAI_API_KEY;
		originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		originalGeminiKey = process.env.GEMINI_API_KEY;

		// Clear all provider keys for clean state
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		delete process.env.GEMINI_API_KEY;
	});

	afterEach(() => {
		// Restore original values
		if (originalAnthropicKey !== undefined) {
			process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
		} else {
			delete process.env.ANTHROPIC_API_KEY;
		}
		if (originalOpenaiKey !== undefined) {
			process.env.OPENAI_API_KEY = originalOpenaiKey;
		} else {
			delete process.env.OPENAI_API_KEY;
		}
		if (originalGoogleKey !== undefined) {
			process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
		} else {
			delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		}
		if (originalGeminiKey !== undefined) {
			process.env.GEMINI_API_KEY = originalGeminiKey;
		} else {
			delete process.env.GEMINI_API_KEY;
		}
	});

	it("returns claude-code when no API keys are set", () => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("claude-code");
	});

	it("returns openai when OPENAI_API_KEY is set", () => {
		// OpenAI takes highest priority when its API key is present
		process.env.OPENAI_API_KEY = "sk-test";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("openai");
	});

	it("returns anthropic when ANTHROPIC_API_KEY is set", () => {
		process.env.ANTHROPIC_API_KEY = "sk-ant-test";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("anthropic");
	});

	it("returns anthropic when claudeApiKey is set in config", () => {
		const config: AppConfig = {
			claudeApiKey: "sk-ant-test",
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("anthropic");
	});

	it("returns google when GOOGLE_GENERATIVE_AI_API_KEY is set alone", () => {
		// Google is selected when its API key is present and OpenAI is not
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("google");
	});

	it("returns google when GEMINI_API_KEY is set alone", () => {
		// GEMINI_API_KEY is an alternative env var name for Google provider
		process.env.GEMINI_API_KEY = "gemini-key";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("google");
	});

	it("returns google when both Google env vars are set (either works)", () => {
		// Both env var names should work, but we just need one
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		process.env.GEMINI_API_KEY = "gemini-key";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("google");
	});

	it("prioritizes google over anthropic when both set", () => {
		// Google takes priority over Anthropic in the detection order
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		process.env.ANTHROPIC_API_KEY = "sk-ant-config";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("google");
	});

	it("prioritizes openai over google and anthropic", () => {
		process.env.OPENAI_API_KEY = "sk-openai";
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		process.env.ANTHROPIC_API_KEY = "sk-anthropic";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("openai");
	});
});

describe("getLlmModelName", () => {
	it.each([
		["claude-code", undefined, "claude-code/sonnet"],
		["openai", undefined, "gpt-4o"],
		["anthropic", undefined, "claude-sonnet-4-20250514"],
		["google", undefined, "gemini-2.5-flash"],
	] as const)("returns correct model name for %s provider", (provider, stagehandModel, expected) => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			stagehandModel,
			logLevel: "error",
		} as AppConfig;

		expect(getLlmModelName(config, provider)).toBe(expected);
	});

	it("uses stagehandModel from config for openai when provided", () => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			stagehandModel: "gpt-4-turbo",
			logLevel: "error",
		} as AppConfig;

		expect(getLlmModelName(config, "openai")).toBe("gpt-4-turbo");
	});

	it("uses stagehandModel from config for google when provided", () => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			stagehandModel: "gemini-2.5-flash-lite",
			logLevel: "error",
		} as AppConfig;

		expect(getLlmModelName(config, "google")).toBe("gemini-2.5-flash-lite");
	});

	it("returns unknown for unrecognized provider", () => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		// @ts-expect-error Testing invalid provider
		expect(getLlmModelName(config, "invalid")).toBe("unknown");
	});

	it("detects provider when not explicitly provided", () => {
		// Save and clear API keys for this test
		const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
		const savedOpenaiKey = process.env.OPENAI_API_KEY;
		const savedGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		const savedGeminiKey = process.env.GEMINI_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		delete process.env.GEMINI_API_KEY;

		try {
			const config: AppConfig = {
				claudeApiKey: undefined,
				logLevel: "error",
			} as AppConfig;

			// Without any API keys, should detect claude-code
			expect(getLlmModelName(config)).toBe("claude-code/sonnet");
		} finally {
			// Restore
			if (savedAnthropicKey) process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
			if (savedOpenaiKey) process.env.OPENAI_API_KEY = savedOpenaiKey;
			if (savedGoogleKey) process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedGoogleKey;
			if (savedGeminiKey) process.env.GEMINI_API_KEY = savedGeminiKey;
		}
	});
});
