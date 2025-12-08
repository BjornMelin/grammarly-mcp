import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../../src/config";
import { detectLlmProvider, getLlmModelName } from "../../../src/llm/stagehandLlm";

// Base test config - all fields explicitly set for test isolation
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

describe("detectLlmProvider", () => {
	describe("explicit provider selection", () => {
		it("returns explicit stagehandLlmProvider when set", () => {
			const config = { ...baseConfig, stagehandLlmProvider: "google" as const };
			expect(detectLlmProvider(config)).toBe("google");
		});

		it("explicit provider overrides API key detection", () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "claude-code" as const,
				openaiApiKey: "test-key", // Would normally trigger openai
			};
			expect(detectLlmProvider(config)).toBe("claude-code");
		});

		it("explicit anthropic ignores google key in config", () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "anthropic" as const,
				googleApiKey: "test-key", // Would normally trigger google
			};
			expect(detectLlmProvider(config)).toBe("anthropic");
		});
	});

	describe("auto-detection from config API keys", () => {
		it("returns claude-code when no API keys are set", () => {
			expect(detectLlmProvider(baseConfig)).toBe("claude-code");
		});

		it("returns openai when openaiApiKey is set", () => {
			const config = { ...baseConfig, openaiApiKey: "sk-test" };
			expect(detectLlmProvider(config)).toBe("openai");
		});

		it("returns google when googleApiKey is set", () => {
			const config = { ...baseConfig, googleApiKey: "google-key" };
			expect(detectLlmProvider(config)).toBe("google");
		});

		it("returns anthropic when anthropicApiKey is set", () => {
			const config = { ...baseConfig, anthropicApiKey: "sk-ant-test" };
			expect(detectLlmProvider(config)).toBe("anthropic");
		});

		it("returns anthropic when claudeApiKey is set", () => {
			const config = { ...baseConfig, claudeApiKey: "sk-ant-test" };
			expect(detectLlmProvider(config)).toBe("anthropic");
		});
	});

	describe("priority ordering", () => {
		it("prioritizes openai over google and anthropic", () => {
			const config = {
				...baseConfig,
				openaiApiKey: "sk-openai",
				googleApiKey: "google-key",
				anthropicApiKey: "sk-anthropic",
			};
			expect(detectLlmProvider(config)).toBe("openai");
		});

		it("prioritizes google over anthropic", () => {
			const config = {
				...baseConfig,
				googleApiKey: "google-key",
				anthropicApiKey: "sk-anthropic",
			};
			expect(detectLlmProvider(config)).toBe("google");
		});
	});
});

describe("getLlmModelName", () => {
	describe("with explicit provider", () => {
		it("returns claude-code/sonnet for claude-code with auto model", () => {
			expect(getLlmModelName(baseConfig, "claude-code")).toBe("claude-code/sonnet");
		});

		it("returns claude-code/haiku for claude-code with haiku model", () => {
			const config = { ...baseConfig, claudeModel: "haiku" as const };
			expect(getLlmModelName(config, "claude-code")).toBe("claude-code/haiku");
		});

		it("returns claude-code/opus for claude-code with opus model", () => {
			const config = { ...baseConfig, claudeModel: "opus" as const };
			expect(getLlmModelName(config, "claude-code")).toBe("claude-code/opus");
		});

		it("returns openaiModel for openai provider", () => {
			expect(getLlmModelName(baseConfig, "openai")).toBe("gpt-4o");
		});

		it("returns custom openaiModel when set", () => {
			const config = { ...baseConfig, openaiModel: "gpt-4-turbo" };
			expect(getLlmModelName(config, "openai")).toBe("gpt-4-turbo");
		});

		it("returns googleModel for google provider", () => {
			expect(getLlmModelName(baseConfig, "google")).toBe("gemini-2.5-flash");
		});

		it("returns custom googleModel when set", () => {
			const config = { ...baseConfig, googleModel: "gemini-2.5-flash-lite" };
			expect(getLlmModelName(config, "google")).toBe("gemini-2.5-flash-lite");
		});

		it("returns fixed model for anthropic provider", () => {
			expect(getLlmModelName(baseConfig, "anthropic")).toBe("claude-sonnet-4-20250514");
		});
	});

	describe("with auto-detected provider", () => {
		it("detects provider when not explicitly provided", () => {
			// Without any API keys, should detect claude-code
			expect(getLlmModelName(baseConfig)).toBe("claude-code/sonnet");
		});

		it("uses openaiModel when openaiApiKey triggers openai", () => {
			const config = { ...baseConfig, openaiApiKey: "sk-test", openaiModel: "gpt-4-turbo" };
			expect(getLlmModelName(config)).toBe("gpt-4-turbo");
		});
	});

	describe("edge cases", () => {
		it("returns unknown for unrecognized provider", () => {
			// @ts-expect-error Testing invalid provider
			expect(getLlmModelName(baseConfig, "invalid")).toBe("unknown");
		});
	});
});
