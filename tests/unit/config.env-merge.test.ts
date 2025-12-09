import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("config environment merging", () => {
  it("uses .env values when IGNORE_SYSTEM_ENV is false and process.env lacks keys", async () => {
    const originalEnv = { ...process.env };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-merge-"));
    const envPath = path.join(tempDir, ".env");

    fs.writeFileSync(
      envPath,
      [
        "BROWSER_PROVIDER=stagehand",
        "BROWSERBASE_API_KEY=from-env-file",
        "BROWSERBASE_PROJECT_ID=from-env-file",
      ].join("\n"),
      "utf-8",
    );

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    // Intentionally replace process.env to isolate this test's variables; restored in finally to avoid leaking to other tests.
    process.env = { IGNORE_SYSTEM_ENV: "false" } as NodeJS.ProcessEnv;

    vi.resetModules();

    try {
      const { config } = await import("../../src/config");

      expect(config.browserbaseApiKey).toBe("from-env-file");
      expect(config.browserbaseProjectId).toBe("from-env-file");
    } finally {
      process.env = originalEnv;
      cwdSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
