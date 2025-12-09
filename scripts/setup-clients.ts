#!/usr/bin/env npx tsx
/**
 * Interactive setup script for configuring MCP clients.
 *
 * Reads environment variables from .env file and writes appropriate
 * configuration to selected MCP client config files.
 *
 * Usage: pnpm setup-clients
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import * as dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Minimal logger for the setup script that avoids importing the main server
// config (which performs strict environment validation and exits early when
// required keys are missing). This keeps the bootstrap flow working even when
// the .env file is incomplete.
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type SetupLogLevel = (typeof LOG_LEVELS)[number];

function resolveLogLevel(): SetupLogLevel {
  const raw = process.env.SETUP_LOG_LEVEL?.toLowerCase();

  if (raw && LOG_LEVELS.includes(raw as SetupLogLevel)) {
    return raw as SetupLogLevel;
  }

  return "info";
}

const configuredLogLevel = resolveLogLevel();

function log(level: SetupLogLevel, message: string, ...extra: unknown[]): void {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(configuredLogLevel)) {
    return;
  }

  const prefix = `[setup-clients:${level}]`;
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  writer(prefix, message, ...extra);
}

// =============================================================================
// Types
// =============================================================================

interface ClientConfig {
  name: string;
  configPath: string;
  format: "json" | "toml";
  description: string;
}

interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

// =============================================================================
// Client Definitions
// =============================================================================

const HOME = os.homedir();

const CLIENTS: ClientConfig[] = [
  {
    name: "Claude Code CLI",
    configPath: path.join(HOME, ".claude", "settings.json"),
    format: "json",
    description: "Claude Code command-line tool",
  },
  {
    name: "Claude Desktop (macOS)",
    configPath: path.join(
      HOME,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    ),
    format: "json",
    description: "Claude Desktop app on macOS",
  },
  {
    name: "Claude Desktop (Linux)",
    configPath: path.join(HOME, ".config", "Claude", "claude_desktop_config.json"),
    format: "json",
    description: "Claude Desktop app on Linux",
  },
  {
    name: "Claude Desktop (Windows)",
    configPath: path.join(
      process.env.APPDATA ?? path.join(HOME, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    ),
    format: "json",
    description: "Claude Desktop app on Windows",
  },
  {
    name: "Cursor",
    configPath: path.join(HOME, ".cursor", "mcp.json"),
    format: "json",
    description: "Cursor AI editor",
  },
  {
    name: "VS Code (GitHub Copilot)",
    configPath: path.join(HOME, ".vscode", "mcp.json"),
    format: "json",
    description: "VS Code with GitHub Copilot MCP support",
  },
  {
    name: "Windsurf",
    configPath: path.join(HOME, ".codeium", "windsurf", "mcp_config.json"),
    format: "json",
    description: "Windsurf (Codeium) editor",
  },
  {
    name: "Gemini CLI",
    configPath: path.join(HOME, ".gemini", "settings.json"),
    format: "json",
    description: "Google Gemini CLI",
  },
  {
    name: "OpenAI Codex CLI",
    configPath: path.join(HOME, ".codex", "config.toml"),
    format: "toml",
    description: "OpenAI Codex CLI (uses TOML format)",
  },
];

function filterClientsForPlatform(
  platform: NodeJS.Platform,
  clients: ClientConfig[] = CLIENTS,
): ClientConfig[] {
  return clients.filter((client) => {
    if (platform === "darwin") {
      return !client.name.includes("(Linux)");
    }
    if (platform === "linux") {
      return !client.name.includes("(macOS)");
    }
    if (platform === "win32") {
      return !client.name.includes("(macOS)") && !client.name.includes("(Linux)");
    }

    return !client.name.includes("(macOS)") && !client.name.includes("(Linux)");
  });
}

// =============================================================================
// Environment Variable Parsing
// =============================================================================

function parseEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, "utf-8");
  return dotenv.parse(content);
}

// =============================================================================
// Config Generation
// =============================================================================

function buildMcpConfig(
  invocation: Pick<McpServerConfig, "command" | "args">,
  envVars: Record<string, string>,
): McpServerConfig {
  // Filter to only include relevant env vars (exclude empty values)
  const filteredEnv: Record<string, string> = {};

  // Required vars
  const requiredKeys = [
    "BROWSER_PROVIDER",
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "BROWSER_USE_API_KEY",
    "BROWSER_USE_PROFILE_ID",
  ];

  // Optional vars
  const optionalKeys = [
    "BROWSERBASE_CONTEXT_ID",
    "BROWSERBASE_SESSION_ID",
    "STAGEHAND_MODEL",
    "STAGEHAND_CACHE_DIR",
    "STAGEHAND_LLM_PROVIDER",
    "REWRITE_LLM_PROVIDER",
    "CLAUDE_MODEL",
    "OPENAI_MODEL",
    "GOOGLE_MODEL",
    "ANTHROPIC_MODEL",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "LOG_LEVEL",
    "LLM_REQUEST_TIMEOUT_MS",
    "CONNECT_TIMEOUT_MS",
  ];

  for (const key of [...requiredKeys, ...optionalKeys]) {
    if (envVars[key]) {
      filteredEnv[key] = envVars[key];
    }
  }

  return {
    command: invocation.command,
    args: invocation.args,
    env: filteredEnv,
  };
}

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function isCommandAvailable(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore" });
  return result.status === 0;
}

function resolveServerInvocation(projectRoot: string): {
  command: string;
  args: string[];
  note: string;
} {
  const binaryName = "grammarly-mcp-server";
  const distPath = path.join(projectRoot, "dist", "server.js");

  if (isCommandAvailable(binaryName)) {
    return {
      command: binaryName,
      args: [],
      note: "Using globally available grammarly-mcp-server for portability across repo moves.",
    };
  }

  if (isCommandAvailable("npx")) {
    return {
      command: "npx",
      args: [binaryName],
      note:
        "Using npx to resolve grammarly-mcp-server (works if the package is installed locally or globally).",
    };
  }

  return {
    command: "node",
    args: [distPath],
    note: "Fallback to local dist path; rerun setup after moving the repository to refresh configs.",
  };
}

function generateJsonConfig(
  existingConfig: Record<string, unknown> | null,
  mcpConfig: McpServerConfig,
): string {
  const config = existingConfig ?? {};

  // Ensure mcpServers object exists
  if (config.mcpServers == null || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  // Add/update grammarly server
  (config.mcpServers as Record<string, unknown>).grammarly = mcpConfig;

  return JSON.stringify(config, null, 2);
}

function generateTomlConfig(
  existingContent: string | null,
  mcpConfig: McpServerConfig,
  serverNote?: string,
): string {
  // Simple TOML generation for OpenAI Codex format
  const lines: string[] = [];

  // If there's existing content, preserve it but remove any existing grammarly section
  if (existingContent) {
    const existingLines = existingContent.split("\n");
    let inGrammarlySection = false;

    for (const line of existingLines) {
      if (line.startsWith("[mcp_servers.grammarly]")) {
        inGrammarlySection = true;
        continue;
      }
      if (inGrammarlySection && /^\s*\[(?!mcp_servers\.grammarly\.)/.test(line)) {
        inGrammarlySection = false;
      }
      if (!inGrammarlySection) {
        lines.push(line);
      }
    }

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    if (lines.length > 0) {
      lines.push("");
    }
  }

  // Add grammarly section
  lines.push("[mcp_servers.grammarly]");
  lines.push(`command = "${escapeTomlString(mcpConfig.command)}"`);
  lines.push(`args = [${mcpConfig.args
    .map((a) => `"${escapeTomlString(a)}"`)
    .join(", ")}]`);
  lines.push("");
  if (serverNote) {
    lines.push(`# ${serverNote}`);
  }
  lines.push("[mcp_servers.grammarly.env]");

  for (const [key, value] of Object.entries(mcpConfig.env)) {
    lines.push(`${key} = "${escapeTomlString(value)}"`);
  }

  lines.push("");

  return lines.join("\n");
}

// =============================================================================
// File Operations
// =============================================================================

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function backupFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.backup.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function readExistingConfig(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readExistingToml(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// =============================================================================
// Interactive CLI
// =============================================================================

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function selectClients(rl: readline.Interface): Promise<ClientConfig[]> {
  console.log("\n=== Grammarly MCP Server Setup ===\n");
  console.log("Available MCP clients:\n");

  // Filter to clients that make sense for the current platform
  const platform = process.platform;
  const availableClients = filterClientsForPlatform(platform);

  for (let i = 0; i < availableClients.length; i++) {
    const client = availableClients[i];
    const exists = fs.existsSync(client.configPath) ? "(config exists)" : "";
    console.log(`  ${i + 1}. ${client.name} ${exists}`);
    console.log(`     ${client.description}`);
    console.log(`     Path: ${client.configPath}\n`);
  }

  console.log("  a. Configure all clients");
  console.log("  q. Quit\n");

  // Keep prompting until the user provides at least one valid selection
  while (true) {
    const answer = await question(
      rl,
      "Enter client numbers (comma-separated) or 'a' for all: ",
    );

    if (answer.toLowerCase() === "q") {
      return [];
    }

    if (answer.toLowerCase() === "a") {
      return availableClients;
    }

    const indices: number[] = [];

    for (const rawToken of answer.split(",")) {
      const token = rawToken.trim();
      if (token === "") {
        log("warn", "Skipping empty selection.");
        continue;
      }

      const parsed = parseInt(token, 10);
      if (Number.isNaN(parsed)) {
        log("warn", `Skipping invalid number: "${token}"`);
        continue;
      }

      const zeroBased = parsed - 1;
      if (zeroBased < 0 || zeroBased >= availableClients.length) {
        log(
          "warn",
          `Selection out of range (must be 1-${availableClients.length}): "${token}"`,
        );
        continue;
      }

      indices.push(zeroBased);
    }

    if (indices.length === 0) {
      log("warn", "No valid selections detected. Please try again.\n");
      continue;
    }

    return indices.map((i) => availableClients[i]);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const moduleDir =
    typeof import.meta.dirname === "string"
      ? import.meta.dirname
      : (() => {
          try {
            return path.dirname(fileURLToPath(import.meta.url));
          } catch {
            return process.cwd();
          }
        })();

  const projectRoot = path.resolve(moduleDir, "..");
  const envPath = path.join(projectRoot, ".env");
  const serverInvocation = resolveServerInvocation(projectRoot);
  const distPath = path.join(projectRoot, "dist", "server.js");

  // Check if build exists when falling back to the local dist path
  if (serverInvocation.command === "node" && !fs.existsSync(distPath)) {
    console.error("\nError: dist/server.js not found.");
    console.error("Please run 'pnpm build' first.\n");
    process.exit(1);
  }

  // Parse .env file
  const envVars = parseEnvFile(envPath);

  if (Object.keys(envVars).length === 0) {
    console.error("\nWarning: No .env file found or file is empty.");
    console.error(`Expected at: ${envPath}`);
    console.error("\nYou can still configure clients, but no env vars will be set.");
    console.error("You may need to manually add environment variables to configs.\n");
  } else {
    console.log(`\nFound ${Object.keys(envVars).length} environment variables in .env`);
  }

  // Validate required vars based on provider
  const provider = envVars.BROWSER_PROVIDER ?? "stagehand";
  if (provider === "stagehand") {
    if (!envVars.BROWSERBASE_API_KEY || !envVars.BROWSERBASE_PROJECT_ID) {
      console.error("\nWarning: BROWSERBASE_API_KEY and/or BROWSERBASE_PROJECT_ID not set.");
      console.error("These are required when using BROWSER_PROVIDER=stagehand (default).\n");
    }
  } else if (provider === "browser-use") {
    if (!envVars.BROWSER_USE_API_KEY || !envVars.BROWSER_USE_PROFILE_ID) {
      console.error("\nWarning: BROWSER_USE_API_KEY and/or BROWSER_USE_PROFILE_ID not set.");
      console.error("These are required when using BROWSER_PROVIDER=browser-use.\n");
    }
  }

  const rl = createReadlineInterface();

  try {
    const selectedClients = await selectClients(rl);

    if (selectedClients.length === 0) {
      log("info", "No clients selected. Exiting.");
      return;
    }

    log("info", `Configuring ${selectedClients.length} client(s)...`);
    log(
      "info",
      `Server invocation: ${serverInvocation.command} ${serverInvocation.args.join(" ")}`,
    );
    log("info", `Note: ${serverInvocation.note}`);

    const mcpConfig = buildMcpConfig(serverInvocation, envVars);

    for (const client of selectedClients) {
      log("info", `--- ${client.name} ---`);
      log("info", `Config path: ${client.configPath}`);

      try {
        // Backup existing config
        const backupPath = backupFile(client.configPath);
        if (backupPath) {
          log("info", `Backed up to: ${backupPath}`);
        }

        // Ensure directory exists
        ensureDir(client.configPath);

        // Generate and write config
        let content: string;
        if (client.format === "json") {
          const existing = readExistingConfig(client.configPath);
          content = generateJsonConfig(existing, mcpConfig);
        } else {
          const existing = readExistingToml(client.configPath);
          content = generateTomlConfig(existing, mcpConfig, serverInvocation.note);
        }

        fs.writeFileSync(client.configPath, content, "utf-8");
        log("info", "Configuration written successfully!");
      } catch (error) {
        log(
          "error",
          `Error configuring ${client.name}:`,
          error instanceof Error ? error : String(error),
        );
      }
    }

    log("info", "=== Setup Complete ===");
    log("info", "The grammarly MCP server has been configured for the selected clients.");
    log("info", "Restart your MCP clients to load the new configuration.");
  } finally {
    rl.close();
  }
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export {
  CLIENTS,
  parseEnvFile,
  buildMcpConfig,
  escapeTomlString,
  generateJsonConfig,
  generateTomlConfig,
  filterClientsForPlatform,
  ensureDir,
  backupFile,
  readExistingConfig,
  readExistingToml,
  createReadlineInterface,
  question,
  selectClients,
  resolveServerInvocation,
  isCommandAvailable,
  main,
};
