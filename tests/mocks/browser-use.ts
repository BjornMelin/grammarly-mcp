import { vi } from "vitest";

/**
 * Creates a mock Browser Use session result.
 */
export function createMockBrowserUseSession(overrides?: Record<string, unknown>) {
	return {
		sessionId: "bu-session-12345",
		liveUrl: "https://live.browser-use.com/sessions/bu-session-12345",
		status: "running" as const,
		...overrides,
	};
}

/**
 * Creates a mock Browser Use task result.
 */
export function createMockBrowserUseTaskResult(
	overrides?: Record<string, unknown>,
) {
	return {
		success: true,
		output: {
			aiDetectionPercent: 15,
			plagiarismPercent: 3,
		},
		steps: 5,
		...overrides,
	};
}

/**
 * Creates a mock Browser Use client with all primary methods stubbed.
 * Matches actual SDK structure with nested sessions and tasks objects.
 */
export function createMockBrowserUseClient(overrides?: Record<string, unknown>) {
	return {
		sessions: {
			createSession: vi.fn().mockResolvedValue(createMockBrowserUseSession()),
			getSession: vi.fn().mockResolvedValue(createMockBrowserUseSession()),
			deleteSession: vi.fn().mockResolvedValue(undefined),
		},
		tasks: {
			createTask: vi.fn().mockResolvedValue({
				complete: vi.fn().mockResolvedValue(createMockBrowserUseTaskResult()),
			}),
		},
		...overrides,
	};
}

/**
 * Creates a failing Browser Use client for error testing.
 */
export function createFailingBrowserUseClient(
	failingMethod: "createSession" | "getSession" | "deleteSession" | "createTask",
	error?: Error,
) {
	const baseClient = createMockBrowserUseClient();
	const err = error ?? new Error(`Mock failure on ${failingMethod}`);

	// Map method names to their location in the nested structure
	if (failingMethod === "createTask") {
		(baseClient.tasks as Record<string, unknown>)[failingMethod] = vi
			.fn()
			.mockRejectedValue(err);
	} else {
		(baseClient.sessions as Record<string, unknown>)[failingMethod] = vi
			.fn()
			.mockRejectedValue(err);
	}

	return baseClient;
}
