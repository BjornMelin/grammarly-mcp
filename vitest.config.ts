import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["**/node_modules/**"],
		environment: "node",
		globals: true,

		// Pool configuration: threads for unit tests (fast), forks for integration (isolation)
		pool: "threads",
		poolOptions: {
			threads: { singleThread: false },
		},

		// Timeouts
		testTimeout: 5000,
		hookTimeout: 10000,

		// Mocking behavior
		clearMocks: true,
		restoreMocks: true,

		// Coverage configuration
		coverage: {
			provider: "v8",
			enabled: false, // Enable via --coverage flag
			reporter: ["text", "json", "html", "lcov"],
			reportsDirectory: "./coverage",
			include: ["src/**/*.ts"],
			exclude: [
				"src/server.ts", // Entry point with side effects
				"**/*.d.ts",
			],
			// Coverage thresholds enforced in CI. Current: 91%+ achieved.
			thresholds: {
				lines: 85,
				functions: 85,
				branches: 75,
				statements: 85,
			},
		},

		// Setup file
		setupFiles: ["./tests/setup.ts"],

		// Reporter configuration
		reporters: ["default"],
	},
});
