import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../../src/config";
import { detectLlmProvider, getLlmModelName } from "../../../src/llm/stagehandLlm";

describe("detectLlmProvider", () => {
	// Store original env values
	let originalAnthropicKey: string | undefined;
	let originalOpenaiKey: string | undefined;
	let originalGoogleKey: string | undefined;

	beforeEach(() => {
		// Save original values
		originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
		originalOpenaiKey = process.env.OPENAI_API_KEY;
		originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

		// Clear all provider keys for clean state
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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
	});

	it("returns claude-code when no API keys are set", () => {
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("claude-code");
	});

	it("returns openai when OPENAI_API_KEY is set (with anthropic credentials)", () => {
		// OpenAI is only checked after claude-code is ruled out
		// (i.e., when ANTHROPIC_API_KEY or claudeApiKey exists)
		process.env.OPENAI_API_KEY = "sk-test";
		process.env.ANTHROPIC_API_KEY = "sk-ant-exists";
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

	it("returns anthropic when claudeApiKey set (even with GOOGLE_GENERATIVE_AI_API_KEY)", () => {
		// Note: In the current implementation, Google is never selected because:
		// - To skip claude-code, you need claudeApiKey OR ANTHROPIC_API_KEY
		// - But those same credentials trigger anthropic return before google check
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		const config: AppConfig = {
			claudeApiKey: "sk-ant-config",
			logLevel: "error",
		} as AppConfig;

		// This test documents the actual behavior - google is never reached
		expect(detectLlmProvider(config)).toBe("anthropic");
	});

	it("prioritizes openai over anthropic", () => {
		process.env.OPENAI_API_KEY = "sk-openai";
		process.env.ANTHROPIC_API_KEY = "sk-anthropic";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("openai");
	});

	it("prioritizes anthropic over google", () => {
		process.env.ANTHROPIC_API_KEY = "sk-anthropic";
		process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
		const config: AppConfig = {
			claudeApiKey: undefined,
			logLevel: "error",
		} as AppConfig;

		expect(detectLlmProvider(config)).toBe("anthropic");
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
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

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
		}
	});
});
