import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMcpConfig,
  filterClientsForPlatform,
  generateJsonConfig,
  generateTomlConfig,
  parseEnvFile,
} from "../../../scripts/setup-clients";

const createTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "setup-clients-"));

describe("module loading", () => {
  it("does not invoke server config validation on import when env is incomplete", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      // Prevent the real exit during the test; TypeScript expects a never return type.
      .mockImplementation((() => {
        throw new Error("process.exit called");
      }) as never);

    const previousEnv = { ...process.env };
    delete process.env.BROWSER_PROVIDER;
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;
    delete process.env.BROWSER_USE_API_KEY;
    delete process.env.BROWSER_USE_PROFILE_ID;

    try {
      await import("../../../scripts/setup-clients?fresh=" + Date.now());

      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      process.env = previousEnv;
      exitSpy.mockRestore();
    }
  });
});

describe("parseEnvFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses simple key-value pairs", () => {
    const envPath = path.join(tempDir, ".env");
    fs.writeFileSync(envPath, "FOO=bar\nBAZ=qux\n");

    expect(parseEnvFile(envPath)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("handles quoted values and skips comments/empty lines", () => {
    const envPath = path.join(tempDir, ".env");
    fs.writeFileSync(
      envPath,
      [
        "QUOTED=\"value with spaces\"",
        "# comment line",
        "",
        "PLAIN=bare",
        "EMPTY=",
      ].join("\n"),
    );

    expect(parseEnvFile(envPath)).toEqual({ QUOTED: "value with spaces", PLAIN: "bare", EMPTY: "" });
  });

  it("returns empty object when file is missing", () => {
    const envPath = path.join(tempDir, "absent.env");

    expect(parseEnvFile(envPath)).toEqual({});
  });
});

describe("buildMcpConfig", () => {
  it("keeps required/optional env vars and drops empty or unknown keys", () => {
    const invocation = { command: "node", args: ["dist/server.js"] } as const;
    const envVars = {
      BROWSER_PROVIDER: "stagehand",
      BROWSERBASE_API_KEY: "base-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      BROWSER_USE_API_KEY: "", // ignored because empty
      BROWSER_USE_PROFILE_ID: "profile-id",
      LOG_LEVEL: "debug", // optional
      EXTRA_KEY: "should-be-dropped",
    } as const;

    const result = buildMcpConfig(invocation, envVars);

    expect(result.command).toBe("node");
    expect(result.args).toEqual(["dist/server.js"]);
    expect(result.env).toEqual({
      BROWSER_PROVIDER: "stagehand",
      BROWSERBASE_API_KEY: "base-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      BROWSER_USE_PROFILE_ID: "profile-id",
      LOG_LEVEL: "debug",
    });
  });

  it("omits optional vars when they are not provided", () => {
    const invocation = { command: "node", args: ["dist/server.js"] } as const;
    const envVars = {
      BROWSER_PROVIDER: "stagehand",
      BROWSERBASE_API_KEY: "base-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      BROWSER_USE_API_KEY: "api-key",
      BROWSER_USE_PROFILE_ID: "profile-id",
    } as const;

    const result = buildMcpConfig(invocation, envVars);

    expect(result.env).toEqual({
      BROWSER_PROVIDER: "stagehand",
      BROWSERBASE_API_KEY: "base-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      BROWSER_USE_API_KEY: "api-key",
      BROWSER_USE_PROFILE_ID: "profile-id",
    });
    expect(result.env.LOG_LEVEL).toBeUndefined();
  });

  it("handles missing required vars by returning an empty env", () => {
    const invocation = { command: "node", args: ["dist/server.js"] } as const;
    const envVars = {} as const;

    const result = buildMcpConfig(invocation, envVars);

    expect(result.env).toEqual({});
  });

  it.each([
    ["node dist", { command: "node", args: ["dist/server.js"] }],
    ["npx binary", { command: "npx", args: ["grammarly-mcp-server", "--flag"] }],
  ])("preserves invocation shape (%s)", (_label, invocation) => {
    const envVars = {
      BROWSER_PROVIDER: "stagehand",
      BROWSERBASE_API_KEY: "base-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      BROWSER_USE_API_KEY: "api-key",
      BROWSER_USE_PROFILE_ID: "profile-id",
    } as const;

    const result = buildMcpConfig(invocation, envVars);

    expect(result.command).toBe(invocation.command);
    expect(result.args).toEqual(invocation.args);
  });
});

describe("generateJsonConfig", () => {
  it("creates config when none exists", () => {
    const mcpConfig = {
      command: "node",
      args: ["dist/server.js"],
      env: { KEY: "value" },
    };

    const json = generateJsonConfig(null, mcpConfig);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.mcpServers).toBeDefined();
    expect((parsed.mcpServers as Record<string, unknown>).grammarly).toEqual(mcpConfig);
  });

  it("merges with existing config and preserves other servers", () => {
    const existing = {
      theme: "dark",
      mcpServers: {
        existing: { command: "node", args: ["existing"], env: { OLD: "1" } },
      },
    };
    const mcpConfig = {
      command: "node",
      args: ["dist/server.js"],
      env: { NEW: "yes" },
    };

    const parsed = JSON.parse(generateJsonConfig(existing, mcpConfig));

    expect(parsed.theme).toBe("dark");
    expect(parsed.mcpServers.existing).toEqual({ command: "node", args: ["existing"], env: { OLD: "1" } });
    expect(parsed.mcpServers.grammarly).toEqual(mcpConfig);
  });
});

describe("generateTomlConfig", () => {
  it("generates grammarly section with escaped values", () => {
    const mcpConfig = {
      command: "node",
      args: ["dist/server.js"],
      env: { API_KEY: "abc", PATH: "C\\path" },
    };

    const toml = generateTomlConfig(null, mcpConfig, "use local dist");

    expect(toml).toContain("[mcp_servers.grammarly]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain('args = ["dist/server.js"]');
    expect(toml).toContain("# use local dist");
    expect(toml).toContain('[mcp_servers.grammarly.env]');
    expect(toml).toContain('API_KEY = "abc"');
    expect(toml).toContain('PATH = "C\\\\path"');
  });

  it("preserves other sections and replaces prior grammarly block", () => {
    const existing = [
      "[profile]",
      'name = "default"',
      "",
      "[mcp_servers.grammarly]",
      'command = "old"',
      "",
      "[other]",
      'value = "1"',
      "",
    ].join("\n");

    const mcpConfig = {
      command: "npx",
      args: ["grammarly-mcp-server"],
      env: { TOKEN: "new" },
    };

    const toml = generateTomlConfig(existing, mcpConfig);
    const grammarlyMatches = toml.match(/\[mcp_servers\.grammarly\]/g) ?? [];

    expect(grammarlyMatches).toHaveLength(1);
    expect(toml).toContain("[profile]");
    expect(toml).toContain('name = "default"');
    expect(toml).toContain("[other]");
    expect(toml).toContain('value = "1"');
    expect(toml).toContain('command = "npx"');
    expect(toml).not.toContain('command = "old"');
  });
});

describe("filterClientsForPlatform", () => {
  const sampleClients = [
    { name: "Client (macOS)", configPath: "a", format: "json", description: "" },
    { name: "Client (Linux)", configPath: "b", format: "json", description: "" },
    { name: "Client (Windows)", configPath: "c", format: "json", description: "" },
    { name: "Client", configPath: "d", format: "json", description: "" },
  ];

  it.each([
    ["linux", ["(macOS)"], undefined],
    ["darwin", ["(Linux)"], undefined],
    ["win32", ["(Linux)", "(macOS)"], "Client (Windows)"],
  ])("filters platform-specific clients for %s", (platform, excludedPatterns: string[], expectedAllowed?: string) => {
    const available = filterClientsForPlatform(platform, sampleClients);

    for (const pattern of excludedPatterns) {
      expect(available.every((c) => !c.name.includes(pattern))).toBe(true);
    }

    if (expectedAllowed) {
      expect(available.map((c) => c.name)).toContain(expectedAllowed);
    }
  });
});
