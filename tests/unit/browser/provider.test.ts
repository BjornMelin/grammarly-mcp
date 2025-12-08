import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/config";

// Mock the stagehand provider module
vi.mock("../../../src/browser/stagehand/index", () => {
	const StagehandProvider = function (this: unknown) {
		return {
			providerName: "stagehand" as const,
			createSession: vi.fn(),
			scoreText: vi.fn(),
			closeSession: vi.fn(),
		};
	};
	return { StagehandProvider };
});

// Mock the browser use provider module
vi.mock("../../../src/browser/browserUseProvider", () => {
	const BrowserUseProvider = function (this: unknown) {
		return {
			providerName: "browser-use" as const,
			createSession: vi.fn(),
			scoreText: vi.fn(),
			closeSession: vi.fn(),
		};
	};
	return { BrowserUseProvider };
});

import { createBrowserProvider } from "../../../src/browser/provider";

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
	claudeApiKey: "test-claude-key",
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

describe("createBrowserProvider", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("returns StagehandProvider when browserProvider is 'stagehand'", async () => {
		const config: AppConfig = { ...baseConfig, browserProvider: "stagehand" };

		const provider = await createBrowserProvider(config);

		expect(provider.providerName).toBe("stagehand");
	});

	it("returns BrowserUseProvider when browserProvider is 'browser-use'", async () => {
		const config: AppConfig = { ...baseConfig, browserProvider: "browser-use" };

		const provider = await createBrowserProvider(config);

		expect(provider.providerName).toBe("browser-use");
	});

	it("creates provider with BrowserProvider interface methods", async () => {
		const config: AppConfig = { ...baseConfig, browserProvider: "stagehand" };

		const provider = await createBrowserProvider(config);

		expect(typeof provider.createSession).toBe("function");
		expect(typeof provider.scoreText).toBe("function");
		expect(typeof provider.closeSession).toBe("function");
	});
});
