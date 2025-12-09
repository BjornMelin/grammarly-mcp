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

// =============================================================================
// Environment Variable Parsing
// =============================================================================

function parseEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value) {
      env[key] = value;
    }
  }

  return env;
}

// =============================================================================
// Config Generation
// =============================================================================

function buildMcpConfig(
  serverPath: string,
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
    command: "node",
    args: [serverPath],
    env: filteredEnv,
  };
}

function generateJsonConfig(
  existingConfig: Record<string, unknown> | null,
  mcpConfig: McpServerConfig,
): string {
  const config = existingConfig ?? {};

  // Ensure mcpServers object exists
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  // Add/update grammarly server
  (config.mcpServers as Record<string, unknown>).grammarly = mcpConfig;

  return JSON.stringify(config, null, 2);
}

function generateTomlConfig(
  existingContent: string | null,
  mcpConfig: McpServerConfig,
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
      if (inGrammarlySection && line.startsWith("[")) {
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
  lines.push(`command = "${mcpConfig.command}"`);
  lines.push(`args = [${mcpConfig.args.map((a) => `"${a}"`).join(", ")}]`);
  lines.push("");
  lines.push("[mcp_servers.grammarly.env]");

  for (const [key, value] of Object.entries(mcpConfig.env)) {
    lines.push(`${key} = "${value}"`);
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
  const availableClients = CLIENTS.filter((client) => {
    if (platform === "darwin") {
      return !client.name.includes("(Linux)");
    }
    if (platform === "linux") {
      return !client.name.includes("(macOS)");
    }
    // Windows - show all except platform-specific
    return !client.name.includes("(macOS)") && !client.name.includes("(Linux)");
  });

  for (let i = 0; i < availableClients.length; i++) {
    const client = availableClients[i];
    const exists = fs.existsSync(client.configPath) ? "(config exists)" : "";
    console.log(`  ${i + 1}. ${client.name} ${exists}`);
    console.log(`     ${client.description}`);
    console.log(`     Path: ${client.configPath}\n`);
  }

  console.log("  a. Configure all clients");
  console.log("  q. Quit\n");

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

  const indices = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < availableClients.length);

  return indices.map((i) => availableClients[i]);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const projectRoot = path.resolve(import.meta.dirname ?? __dirname, "..");
  const envPath = path.join(projectRoot, ".env");
  const serverPath = path.join(projectRoot, "dist", "server.js");

  // Check if build exists
  if (!fs.existsSync(serverPath)) {
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
      console.log("\nNo clients selected. Exiting.\n");
      return;
    }

    console.log(`\nConfiguring ${selectedClients.length} client(s)...\n`);

    const mcpConfig = buildMcpConfig(serverPath, envVars);

    for (const client of selectedClients) {
      console.log(`\n--- ${client.name} ---`);
      console.log(`Config path: ${client.configPath}`);

      try {
        // Backup existing config
        const backupPath = backupFile(client.configPath);
        if (backupPath) {
          console.log(`Backed up to: ${backupPath}`);
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
          content = generateTomlConfig(existing, mcpConfig);
        }

        fs.writeFileSync(client.configPath, content, "utf-8");
        console.log("Configuration written successfully!");
      } catch (error) {
        console.error(
          `Error configuring ${client.name}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.log("\n=== Setup Complete ===\n");
    console.log("The grammarly MCP server has been configured for the selected clients.");
    console.log("Restart your MCP clients to load the new configuration.\n");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
