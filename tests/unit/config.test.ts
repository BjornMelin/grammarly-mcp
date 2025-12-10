import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type LogLevel,
	ProxyConfigSchema,
	buildIproyalPassword,
	getSessionOptions,
	log,
	type AppConfig,
} from "../../src/config";

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

describe("buildIproyalPassword", () => {
	it("returns base password when no options provided", () => {
		expect(buildIproyalPassword("mypass")).toBe("mypass");
	});

	it("returns base password when options object is empty", () => {
		expect(buildIproyalPassword("mypass", {})).toBe("mypass");
	});

	it("appends country parameter in lowercase", () => {
		expect(buildIproyalPassword("mypass", { country: "US" })).toBe(
			"mypass_country-us",
		);
	});

	it("appends session ID parameter", () => {
		expect(buildIproyalPassword("mypass", { sessionId: "abc12345" })).toBe(
			"mypass_session-abc12345",
		);
	});

	it("appends session lifetime parameter", () => {
		expect(buildIproyalPassword("mypass", { sessionLifetime: "30m" })).toBe(
			"mypass_lifetime-30m",
		);
	});

	it("appends all IPRoyal parameters in correct order", () => {
		expect(
			buildIproyalPassword("mypass", {
				country: "GB",
				sessionId: "xyz98765",
				sessionLifetime: "1h",
			}),
		).toBe("mypass_country-gb_session-xyz98765_lifetime-1h");
	});

	it("handles lowercase country codes", () => {
		expect(buildIproyalPassword("mypass", { country: "de" })).toBe(
			"mypass_country-de",
		);
	});

	it("handles partial options (country + sessionId only)", () => {
		expect(
			buildIproyalPassword("mypass", { country: "US", sessionId: "test1234" }),
		).toBe("mypass_country-us_session-test1234");
	});

	it("handles partial options (country + sessionLifetime only)", () => {
		expect(
			buildIproyalPassword("mypass", { country: "US", sessionLifetime: "10m" }),
		).toBe("mypass_country-us_lifetime-10m");
	});
});

describe("ProxyConfigSchema BYOP validation", () => {
	describe("type field", () => {
		it("defaults to browserbase when not specified", () => {
			const result = ProxyConfigSchema.parse({ country: "US" });
			expect(result.type).toBe("browserbase");
		});

		it("accepts browserbase type explicitly", () => {
			const result = ProxyConfigSchema.parse({ type: "browserbase", country: "US" });
			expect(result.type).toBe("browserbase");
		});

		it("accepts external type with required fields", () => {
			const result = ProxyConfigSchema.parse({
				type: "external",
				server: "http://proxy.example.com:8080",
				username: "user",
				password: "pass",
			});
			expect(result.type).toBe("external");
		});

		it("rejects invalid type", () => {
			expect(() =>
				ProxyConfigSchema.parse({ type: "invalid" }),
			).toThrow();
		});
	});

	describe("external proxy validation", () => {
		it("requires server for external type", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					type: "external",
					username: "user",
					password: "pass",
				}),
			).toThrow("External proxy requires server, username, and password");
		});

		it("requires username for external type", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					type: "external",
					server: "http://proxy.example.com:8080",
					password: "pass",
				}),
			).toThrow("External proxy requires server, username, and password");
		});

		it("requires password for external type", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					type: "external",
					server: "http://proxy.example.com:8080",
					username: "user",
				}),
			).toThrow("External proxy requires server, username, and password");
		});

		it("validates server is a valid URL", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					type: "external",
					server: "not-a-url",
					username: "user",
					password: "pass",
				}),
			).toThrow();
		});

		it("accepts valid external proxy config with all fields", () => {
			const result = ProxyConfigSchema.parse({
				type: "external",
				server: "http://geo.iproyal.com:12321",
				username: "iproyal_user",
				password: "iproyal_pass",
				country: "US",
				sessionId: "abc12345",
				sessionLifetime: "30m",
			});
			expect(result).toMatchObject({
				type: "external",
				server: "http://geo.iproyal.com:12321",
				username: "iproyal_user",
				password: "iproyal_pass",
				country: "US",
				sessionId: "abc12345",
				sessionLifetime: "30m",
			});
		});
	});

	describe("sessionId validation", () => {
		it("accepts valid 8 alphanumeric session ID", () => {
			const result = ProxyConfigSchema.parse({
				country: "US",
				sessionId: "abc12345",
			});
			expect(result.sessionId).toBe("abc12345");
		});

		it("rejects session ID shorter than 8 characters", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					country: "US",
					sessionId: "abc1234",
				}),
			).toThrow();
		});

		it("rejects session ID longer than 8 characters", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					country: "US",
					sessionId: "abc123456",
				}),
			).toThrow();
		});

		it("rejects session ID with special characters", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					country: "US",
					sessionId: "abc-1234",
				}),
			).toThrow();
		});
	});

	describe("sessionLifetime validation", () => {
		it("accepts seconds format", () => {
			const result = ProxyConfigSchema.parse({
				country: "US",
				sessionLifetime: "30s",
			});
			expect(result.sessionLifetime).toBe("30s");
		});

		it("accepts minutes format", () => {
			const result = ProxyConfigSchema.parse({
				country: "US",
				sessionLifetime: "10m",
			});
			expect(result.sessionLifetime).toBe("10m");
		});

		it("accepts hours format", () => {
			const result = ProxyConfigSchema.parse({
				country: "US",
				sessionLifetime: "2h",
			});
			expect(result.sessionLifetime).toBe("2h");
		});

		it("accepts days format", () => {
			const result = ProxyConfigSchema.parse({
				country: "US",
				sessionLifetime: "1d",
			});
			expect(result.sessionLifetime).toBe("1d");
		});

		it("rejects invalid lifetime format", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					country: "US",
					sessionLifetime: "10x",
				}),
			).toThrow();
		});

		it("rejects lifetime without unit", () => {
			expect(() =>
				ProxyConfigSchema.parse({
					country: "US",
					sessionLifetime: "30",
				}),
			).toThrow();
		});
	});

	describe("browserbase type does not require external fields", () => {
		it("accepts browserbase type without server/username/password", () => {
			const result = ProxyConfigSchema.parse({
				type: "browserbase",
				country: "US",
			});
			expect(result.type).toBe("browserbase");
			expect(result.server).toBeUndefined();
		});
	});
});

describe("getSessionOptions BYOP fields", () => {
	const baseConfig: AppConfig = {
		ignoreSystemEnv: false,
		browserProvider: "stagehand",
		browserUseApiKey: undefined,
		browserUseProfileId: undefined,
		browserbaseApiKey: "test-key",
		browserbaseProjectId: "test-project",
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
		claudeApiKey: "test-claude-key",
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

	describe("external proxy configuration", () => {
		it("returns BYOP fields from env config", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "external",
					server: "http://geo.iproyal.com:12321",
					username: "user",
					password: "pass",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyType).toBe("external");
			expect(result.proxyServer).toBe("http://geo.iproyal.com:12321");
			expect(result.proxyUsername).toBe("user");
			expect(result.proxyPassword).toBe("pass"); // No IPRoyal params without country
			expect(result.proxyEnabled).toBe(true);
		});

		it("builds IPRoyal password with session parameters", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "external",
					server: "http://geo.iproyal.com:12321",
					username: "user",
					password: "basepass",
					country: "US",
					sessionId: "abc12345",
					sessionLifetime: "30m",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyPassword).toBe(
				"basepass_country-us_session-abc12345_lifetime-30m",
			);
		});

		it("preserves password with existing IPRoyal params", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "external",
					server: "http://geo.iproyal.com:12321",
					username: "user",
					password: "basepass_country-gb_session-xyz98765",
				},
			};

			const result = getSessionOptions(config);
			// Password already has params, should not be modified
			expect(result.proxyPassword).toBe("basepass_country-gb_session-xyz98765");
		});

		it("enables proxy for external type with server", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "external",
					server: "http://proxy.example.com:8080",
					username: "user",
					password: "pass",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyEnabled).toBe(true);
		});

		it("disables proxy when enabled=false for external type", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: false,
					type: "external",
					server: "http://proxy.example.com:8080",
					username: "user",
					password: "pass",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyEnabled).toBe(false);
		});
	});

	describe("browserbase proxy type", () => {
		it("returns undefined proxyType when not specified (defaults to browserbase behavior)", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					country: "US",
				},
			};

			const result = getSessionOptions(config);
			// When type is not specified in config, it's undefined
			// sessionManager treats undefined as browserbase behavior
			expect(result.proxyType).toBeUndefined();
			expect(result.proxyServer).toBeUndefined();
		});

		it("returns browserbase type when explicitly set", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "browserbase",
					country: "US",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyType).toBe("browserbase");
			expect(result.proxyServer).toBeUndefined();
		});

		it("enables proxy for browserbase type with country", () => {
			const config: AppConfig = {
				...baseConfig,
				proxyConfig: {
					enabled: true,
					type: "browserbase",
					country: "GB",
				},
			};

			const result = getSessionOptions(config);
			expect(result.proxyEnabled).toBe(true);
			expect(result.proxyCountry).toBe("GB");
		});
	});
});
