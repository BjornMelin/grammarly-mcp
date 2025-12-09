// Environment variables are now set in vitest.config.ts `env` option.
// This ensures they're available BEFORE any test modules are loaded,
// which is critical because config.ts reads them at module load time.
// Setting them here in setupFiles would be too late.

import { afterEach, beforeEach, vi } from "vitest";

// Reset mocks between tests for isolation
beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});
