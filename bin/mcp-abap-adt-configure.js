#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

let yaml;
try {
  // Optional dependency already in package.json
  // eslint-disable-next-line import/no-extraneous-dependencies
  yaml = require("yaml");
} catch {
  yaml = null;
}

let toml;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  toml = require("@iarna/toml");
} catch {
  toml = null;
}

const args = process.argv.slice(2);
const options = {
  clients: [],
  envPath: null,
  mcpDestination: null,
  name: null,
  transport: "stdio",
  command: "mcp-abap-adt",
  dryRun: false,
  force: false,
  project: null,
  disabled: false,
  toggle: false,
  remove: false,
  configPath: null,
};

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--client") {
    options.clients.push(args[i + 1]);
    i += 1;
  } else if (arg === "--env") {
    options.envPath = args[i + 1];
    i += 1;
  } else if (arg === "--mcp") {
    options.mcpDestination = args[i + 1];
    i += 1;
  } else if (arg === "--name") {
    options.name = args[i + 1];
    i += 1;
  } else if (arg === "--transport") {
    options.transport = args[i + 1];
    i += 1;
  } else if (arg === "--command") {
    options.command = args[i + 1];
    i += 1;
  } else if (arg === "--project") {
    options.project = args[i + 1];
    i += 1;
  } else if (arg === "--config") {
    options.configPath = args[i + 1];
    i += 1;
  } else if (arg === "--disable") {
    options.disabled = true;
    options.toggle = true;
  } else if (arg === "--enable") {
    options.disabled = false;
    options.toggle = true;
  } else if (arg === "--remove") {
    options.remove = true;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  } else if (arg === "--force") {
    options.force = true;
  }
}

if (options.clients.length === 0) {
  fail("Provide at least one --client.");
}

if (!options.name) {
  fail("Provide --name <serverName> (required).");
}

if (options.transport !== "stdio") {
  fail("Only --transport stdio is supported by this installer.");
}

const requiresConnectionParams = !options.remove && !options.toggle;

if (requiresConnectionParams) {
  if (!options.envPath && !options.mcpDestination) {
    fail("Provide either --env <path> or --mcp <destination>.");
  }

  if (options.envPath && options.mcpDestination) {
    fail("Use only one of --env or --mcp.");
  }
}

const platform = process.platform;
const home = os.homedir();
const appData =
  process.env.APPDATA || path.join(home, "AppData", "Roaming");
const userProfile = process.env.USERPROFILE || home;

const serverArgsRaw = options.remove || options.toggle
  ? []
  : [
      `--transport=${options.transport}`,
      options.envPath
        ? `--env=${options.envPath}`
        : options.mcpDestination
          ? `--mcp=${options.mcpDestination.toLowerCase()}`
          : undefined,
    ];
const serverArgs = serverArgsRaw.filter(Boolean);

for (const client of options.clients) {
  switch (client) {
    case "cline":
      writeJsonConfig(
        getClinePath(platform, home, appData),
        options.name,
        serverArgs,
        "cline"
      );
      break;
    case "codex":
      writeCodexConfig(getCodexPath(platform, home, userProfile), options.name, serverArgs);
      break;
    case "claude":
      writeClaudeConfig(
        getClaudePath(platform, home, appData, options.configPath),
        options.name,
        serverArgs
      );
      break;
    case "goose":
      writeGooseConfig(
        getGoosePath(platform, home, appData),
        options.name,
        serverArgs
      );
      break;
    case "cursor":
      writeJsonConfig(
        getCursorPath(platform, home, userProfile),
        options.name,
        serverArgs,
        "cursor"
      );
      break;
    case "windsurf":
      writeJsonConfig(
        getWindsurfPath(platform, home, userProfile),
        options.name,
        serverArgs,
        "windsurf"
      );
      break;
    default:
      fail(`Unknown client: ${client}`);
  }
}

function getClinePath(platformValue, homeDir, appDataDir) {
  if (platformValue === "win32") {
    return path.join(
      appDataDir,
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json"
    );
  }
  return path.join(
    homeDir,
    ".config",
    "Code",
    "User",
    "globalStorage",
    "saoudrizwan.claude-dev",
    "settings",
    "cline_mcp_settings.json"
  );
}

function getCodexPath(platformValue, homeDir, userProfileDir) {
  if (platformValue === "win32") {
    return path.join(userProfileDir, ".codex", "config.toml");
  }
  return path.join(homeDir, ".codex", "config.toml");
}

function getClaudePath(platformValue, homeDir, appDataDir, overridePath) {
  if (overridePath) {
    return overridePath;
  }
  if (platformValue === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  if (platformValue === "win32") {
    return path.join(appDataDir, "Claude", "claude_desktop_config.json");
  }
  return path.join(homeDir, ".claude.json");
}

function getGoosePath(platformValue, homeDir, appDataDir) {
  if (platformValue === "win32") {
    return path.join(appDataDir, "Block", "goose", "config", "config.yaml");
  }
  return path.join(homeDir, ".config", "goose", "config.yaml");
}

function getCursorPath(_platformValue, homeDir, userProfileDir) {
  const base = _platformValue === "win32" ? userProfileDir : homeDir;
  return path.join(base, ".cursor", "mcp.json");
}

function getWindsurfPath(platformValue, homeDir, userProfileDir) {
  if (platformValue === "win32") {
    return path.join(userProfileDir, ".codeium", "windsurf", "mcp_config.json");
  }
  return path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
}

function getDefaultDisabled(clientType) {
  return ["cline", "codex", "windsurf", "goose"].includes(clientType);
}

function writeJsonConfig(filePath, serverName, argsArray, clientType) {
  ensureDir(filePath);
  const data = readJson(filePath);
  data.mcpServers = data.mcpServers || {};
  if (options.toggle && clientType === "cursor") {
    fail("Cursor does not support enable/disable. Use --remove instead.");
  }
  if (options.toggle) {
    if (!data.mcpServers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.mcpServers[serverName] = {
      ...data.mcpServers[serverName],
      disabled: options.disabled || undefined,
    };
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (options.remove) {
    if (!data.mcpServers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete data.mcpServers[serverName];
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (data.mcpServers[serverName] && !options.force) {
    fail(
      `Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`
    );
  }
  data.mcpServers[serverName] = {
    command: options.command,
    args: argsArray,
    disabled:
      options.disabled || (getDefaultDisabled(clientType) ? true : undefined),
  };
  writeFile(filePath, JSON.stringify(data, null, 2));
}

function writeClaudeConfig(filePath, serverName, argsArray) {
  ensureDir(filePath);
  const data = readJson(filePath);
  if (!options.project) {
    options.project = process.cwd();
  }
  data.projects = data.projects || {};
  if (!data.projects[options.project]) {
    data.projects[options.project] = {
      allowedTools: [],
      mcpContextUris: [],
      mcpServers: {},
    };
  }
  data.projects[options.project].mcpServers =
    data.projects[options.project].mcpServers || {};
  if (options.toggle) {
    fail("Claude does not support enable/disable. Use --remove instead.");
  }
  if (options.remove) {
    if (!data.projects[options.project].mcpServers[serverName]) {
      fail(`Server "${serverName}" not found for ${options.project}.`);
    }
    delete data.projects[options.project].mcpServers[serverName];
    writeFile(filePath, JSON.stringify(data, null, 2));
    return;
  }
  if (data.projects[options.project].mcpServers[serverName] && !options.force) {
    fail(
      `Server "${serverName}" already exists for ${options.project}. Use --force to overwrite.`
    );
  }
  data.projects[options.project].mcpServers[serverName] = {
    type: "stdio",
    command: options.command,
    args: argsArray,
    env: {},
  };
  writeFile(filePath, JSON.stringify(data, null, 2));
}

function writeCodexConfig(filePath, serverName, argsArray) {
  ensureDir(filePath);
  if (!toml) {
    fail("TOML dependency not available. Install dependencies and retry.");
  }

  const data = readToml(filePath);
  data.mcp_servers = data.mcp_servers || {};
  const defaultEnabled = !getDefaultDisabled("codex");

  if (options.remove) {
    if (!data.mcp_servers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete data.mcp_servers[serverName];
    writeFile(filePath, toml.stringify(data));
    return;
  }

  if (options.toggle) {
    if (!data.mcp_servers[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.mcp_servers[serverName] = {
      ...data.mcp_servers[serverName],
      enabled: !options.disabled,
    };
    writeFile(filePath, toml.stringify(data));
    return;
  }

  if (data.mcp_servers[serverName] && !options.force) {
    fail(
      `Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`
    );
  }

  data.mcp_servers[serverName] = {
    command: options.command,
    args: argsArray,
    enabled: options.disabled ? false : defaultEnabled,
  };

  writeFile(filePath, toml.stringify(data));
}

function writeGooseConfig(filePath, serverName, argsArray) {
  if (!yaml) {
    fail("YAML dependency not available. Install dependencies and retry.");
  }
  ensureDir(filePath);
  const data = readYaml(filePath);
  data.extensions = data.extensions || {};
  if (options.toggle) {
    if (!data.extensions[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    data.extensions[serverName] = {
      ...data.extensions[serverName],
      enabled: !options.disabled,
    };
    writeFile(filePath, yaml.stringify(data));
    return;
  }
  if (options.remove) {
    if (!data.extensions[serverName]) {
      fail(`Server "${serverName}" not found in ${filePath}.`);
    }
    delete data.extensions[serverName];
    writeFile(filePath, yaml.stringify(data));
    return;
  }
  if (data.extensions[serverName] && !options.force) {
    fail(
      `Server "${serverName}" already exists in ${filePath}. Use --force to overwrite.`
    );
  }
  data.extensions[serverName] = {
    name: "MCP ABAP ADT",
    cmd: options.command,
    args: argsArray,
    type: "stdio",
    enabled: options.disabled ? false : !getDefaultDisabled("goose"),
    timeout: 300,
  };
  writeFile(filePath, yaml.stringify(data));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail(`Invalid JSON: ${filePath}`);
  }
}

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return yaml.parse(raw) || {};
  } catch {
    fail(`Invalid YAML: ${filePath}`);
  }
}

function readToml(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return toml.parse(raw) || {};
  } catch {
    fail(`Invalid TOML: ${filePath}`);
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  if (options.dryRun) {
    process.stdout.write(`\n# ${filePath}\n${content}\n`);
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
  process.stdout.write(`Updated ${filePath}\n`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`mcp-abap-adt-configure

Usage:
  mcp-abap-adt-configure --client <name> --name <serverName> [--env <path> | --mcp <dest>] [options]

Options:
  --client <name>       cline | codex | claude | goose | cursor | windsurf (repeatable)
  --name <serverName>   required MCP server name key
  --env <path>          .env path (add/update only)
  --mcp <dest>          destination name (add/update only)
  --transport <type>    only stdio supported
  --command <bin>       command to run (default: mcp-abap-adt)
  --project <path>      Claude project path (defaults to cwd)
  --config <path>       override client config path (Claude Linux)
  --disable             disable entry (Codex/Cline/Windsurf/Goose only)
  --enable              enable entry (Codex/Cline/Windsurf/Goose only)
  --remove              remove entry
  --force               overwrite existing entry (add/update)
  --dry-run             print changes without writing files
  -h, --help            show this help

Notes:
  New entries for Cline/Codex/Windsurf/Goose are added disabled by default.
`);
}
