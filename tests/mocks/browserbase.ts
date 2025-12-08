import { vi } from "vitest";

/**
 * Creates a mock Browserbase session object.
 */
export function createMockSession(overrides?: Record<string, unknown>) {
	return {
		id: "mock-session-123",
		status: "RUNNING" as const,
		projectId: "mock-project-456",
		createdAt: "2025-01-01T00:00:00.000Z",
		...overrides,
	};
}

/**
 * Creates a mock Browserbase context object.
 */
export function createMockContext(overrides?: Record<string, unknown>) {
	return {
		id: "mock-context-789",
		projectId: "mock-project-456",
		...overrides,
	};
}

/**
 * Creates a mock Browserbase SDK client with all primary methods stubbed.
 */
export function createMockBrowserbase(overrides?: Record<string, unknown>) {
	return {
		sessions: {
			create: vi.fn().mockResolvedValue(createMockSession()),
			retrieve: vi.fn().mockResolvedValue(createMockSession()),
			update: vi.fn().mockResolvedValue(undefined),
			list: vi.fn().mockResolvedValue({ data: [] }),
			debug: vi.fn().mockResolvedValue({
				debuggerFullscreenUrl: "https://debug.browserbase.io/mock-session",
				wsUrl: "wss://connect.browserbase.io/mock-session",
			}),
		},
		contexts: {
			create: vi.fn().mockResolvedValue(createMockContext()),
			retrieve: vi.fn().mockResolvedValue(createMockContext()),
		},
		...overrides,
	};
}

/**
 * Creates mock debug URLs returned by Browserbase.
 */
export function createMockDebugUrls(sessionId = "mock-session-123") {
	return {
		debuggerFullscreenUrl: `https://debug.browserbase.io/${sessionId}`,
		wsUrl: `wss://connect.browserbase.io/${sessionId}`,
	};
}
