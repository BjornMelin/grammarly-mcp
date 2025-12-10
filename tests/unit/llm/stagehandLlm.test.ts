import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AppConfig } from "../../../src/config";
import { detectLlmProvider, getLlmModelName, createStagehandLlmClient } from "../../../src/llm/stagehandLlm";

// Mock model functions
const mockClaudeCodeModel = vi.fn();
const mockOpenaiModel = vi.fn();
const mockAnthropicModel = vi.fn();
const mockGoogleModel = vi.fn();

// Mock AISdkClient class
class MockAISdkClient {
	model: unknown;
	constructor(opts: { model: unknown }) {
		this.model = opts.model;
	}
}

// Mock dynamic imports
vi.mock("@browserbasehq/stagehand", () => ({
	AISdkClient: MockAISdkClient,
}));

vi.mock("ai-sdk-provider-claude-code", () => ({
	claudeCode: (modelId: string) => mockClaudeCodeModel(modelId),
}));

vi.mock("@ai-sdk/openai", () => ({
	openai: (model: string) => mockOpenaiModel(model),
}));

vi.mock("@ai-sdk/anthropic", () => ({
	anthropic: (model: string) => mockAnthropicModel(model),
}));

vi.mock("@ai-sdk/google", () => ({
	google: (model: string) => mockGoogleModel(model),
}));

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
	anthropicModel: "claude-sonnet-4-20250514",
	claudeApiKey: undefined,
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
	proxyConfig: null,
	stealthConfig: null,
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

describe("createStagehandLlmClient", () => {
	beforeEach(() => {
		// Set up mock return values (resetAllMocks() runs in afterEach for cleanup)
		mockClaudeCodeModel.mockReturnValue({ id: "claude-code-model" });
		mockOpenaiModel.mockReturnValue({ id: "openai-model" });
		mockAnthropicModel.mockReturnValue({ id: "anthropic-model" });
		mockGoogleModel.mockReturnValue({ id: "google-model" });
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("claude-code provider", () => {
		it("creates client with claude-code provider using sonnet for auto model", async () => {
			const config = { ...baseConfig, stagehandLlmProvider: "claude-code" as const };
			const client = await createStagehandLlmClient(config);

			expect(mockClaudeCodeModel).toHaveBeenCalledWith("sonnet");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "claude-code-model" });
		});

		it("creates client with explicit haiku model", async () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "claude-code" as const,
				claudeModel: "haiku" as const,
			};
			const client = await createStagehandLlmClient(config);

			expect(mockClaudeCodeModel).toHaveBeenCalledWith("haiku");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "claude-code-model" });
		});

		it("creates client with explicit opus model", async () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "claude-code" as const,
				claudeModel: "opus" as const,
			};
			const client = await createStagehandLlmClient(config);

			expect(mockClaudeCodeModel).toHaveBeenCalledWith("opus");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "claude-code-model" });
		});
	});

	describe("openai provider", () => {
		it("creates client with openai provider", async () => {
			const config = { ...baseConfig, stagehandLlmProvider: "openai" as const };
			const client = await createStagehandLlmClient(config);

			expect(mockOpenaiModel).toHaveBeenCalledWith("gpt-4o");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "openai-model" });
		});

		it("creates client with custom openai model", async () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "openai" as const,
				openaiModel: "gpt-4-turbo",
			};
			const client = await createStagehandLlmClient(config);

			expect(mockOpenaiModel).toHaveBeenCalledWith("gpt-4-turbo");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "openai-model" });
		});
	});

	describe("anthropic provider", () => {
		it("creates client with anthropic provider", async () => {
			const config = { ...baseConfig, stagehandLlmProvider: "anthropic" as const };
			const client = await createStagehandLlmClient(config);

			expect(mockAnthropicModel).toHaveBeenCalledWith("claude-sonnet-4-20250514");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "anthropic-model" });
		});

		it("creates client with custom anthropic model", async () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "anthropic" as const,
				anthropicModel: "claude-opus-4-20250514",
			};
			const client = await createStagehandLlmClient(config);

			expect(mockAnthropicModel).toHaveBeenCalledWith("claude-opus-4-20250514");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "anthropic-model" });
		});
	});

	describe("google provider", () => {
		it("creates client with google provider", async () => {
			const config = { ...baseConfig, stagehandLlmProvider: "google" as const };
			const client = await createStagehandLlmClient(config);

			expect(mockGoogleModel).toHaveBeenCalledWith("gemini-2.5-flash");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "google-model" });
		});

		it("creates client with custom google model", async () => {
			const config = {
				...baseConfig,
				stagehandLlmProvider: "google" as const,
				googleModel: "gemini-2.5-flash-lite",
			};
			const client = await createStagehandLlmClient(config);

			expect(mockGoogleModel).toHaveBeenCalledWith("gemini-2.5-flash-lite");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "google-model" });
		});
	});

	describe("preferredProvider parameter", () => {
		it("uses preferredProvider when explicitly passed", async () => {
			// Config would auto-detect claude-code, but we override with openai
			const config = { ...baseConfig };
			const client = await createStagehandLlmClient(config, "openai");

			expect(mockOpenaiModel).toHaveBeenCalledWith("gpt-4o");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "openai-model" });
		});

		it("prefers explicit preferredProvider over config stagehandLlmProvider", async () => {
			const config = { ...baseConfig, stagehandLlmProvider: "google" as const };
			const client = await createStagehandLlmClient(config, "anthropic");

			expect(mockAnthropicModel).toHaveBeenCalledWith("claude-sonnet-4-20250514");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "anthropic-model" });
		});
	});

	describe("error handling", () => {
		it("throws error for unknown provider", async () => {
			const config = { ...baseConfig };
			// @ts-expect-error Testing invalid provider
			await expect(createStagehandLlmClient(config, "invalid-provider")).rejects.toThrow(
				"Unknown LLM provider: invalid-provider"
			);
		});
	});

	describe("auto-detection", () => {
		it("auto-detects claude-code when no API keys or explicit provider", async () => {
			const config = { ...baseConfig };
			const client = await createStagehandLlmClient(config);

			expect(mockClaudeCodeModel).toHaveBeenCalledWith("sonnet");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "claude-code-model" });
		});

		it("auto-detects openai when openaiApiKey is set", async () => {
			const config = { ...baseConfig, openaiApiKey: "sk-test" };
			const client = await createStagehandLlmClient(config);

			expect(mockOpenaiModel).toHaveBeenCalledWith("gpt-4o");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "openai-model" });
		});

		it("auto-detects google when googleApiKey is set", async () => {
			const config = { ...baseConfig, googleApiKey: "google-key" };
			const client = await createStagehandLlmClient(config);

			expect(mockGoogleModel).toHaveBeenCalledWith("gemini-2.5-flash");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "google-model" });
		});

		it("auto-detects anthropic when anthropicApiKey is set", async () => {
			const config = { ...baseConfig, anthropicApiKey: "sk-ant-test" };
			const client = await createStagehandLlmClient(config);

			expect(mockAnthropicModel).toHaveBeenCalledWith("claude-sonnet-4-20250514");
			expect(client).toBeInstanceOf(MockAISdkClient);
			expect(client.model).toEqual({ id: "anthropic-model" });
		});
	});
});
