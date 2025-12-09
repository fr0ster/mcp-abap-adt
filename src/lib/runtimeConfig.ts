import fs from "fs";
import path from "path";

export function parseEnvArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--env=")) {
      const envPath = arg.slice("--env=".length);
      if (envPath.length === 0) continue;
      if (envPath.startsWith(".\\") || envPath.startsWith("./")) {
        return path.resolve(process.cwd(), envPath);
      }
      return envPath;
    } else if (arg === "--env" && i + 1 < args.length) {
      const envPath = args[i + 1];
      if (!envPath || envPath.startsWith("-")) continue;
      if (envPath.startsWith(".\\") || envPath.startsWith("./")) {
        return path.resolve(process.cwd(), envPath);
      }
      return envPath;
    }
  }
  return undefined;
}

export function parseAuthBrokerPathArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--auth-broker-path=")) {
      return arg.slice("--auth-broker-path=".length);
    } else if (arg === "--auth-broker-path" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

export function parseMcpDestinationArg(): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--mcp=")) {
      return arg.slice("--mcp=".length);
    } else if (arg === "--mcp" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

export function getTransportType(): string | null {
  const args = process.argv;
  for (const arg of args) {
    if (arg.startsWith("--transport=")) {
      return arg.slice("--transport=".length);
    }
  }
  return null;
}

export function resolveEnvFromCwd(): string | undefined {
  const cwdEnvPath = path.resolve(process.cwd(), ".env");
  return fs.existsSync(cwdEnvPath) ? cwdEnvPath : undefined;
}

export function buildRuntimeConfig() {
  const useAuthBroker = process.argv.includes("--auth-broker") || process.env.MCP_USE_AUTH_BROKER === "true";
  const isTestEnv = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === "test";
  const authBrokerPath = parseAuthBrokerPathArg();
  const defaultMcpDestination = parseMcpDestinationArg();
  const unsafe = process.argv.includes("--unsafe") || process.env.MCP_UNSAFE === "true";
  const explicitTransportType = getTransportType();
  const transportType = explicitTransportType || "streamable-http";
  const isHttp = transportType === "http" || transportType === "streamable-http" || transportType === "server";
  const isSse = transportType === "sse";
  const isStdio = transportType === "stdio";
  const isEnvMandatory = explicitTransportType !== null && (isStdio || isSse) && !defaultMcpDestination && !useAuthBroker && !isTestEnv;
  let envFilePath = parseEnvArg() ?? process.env.MCP_ENV_PATH;

  return {
    useAuthBroker,
    isTestEnv,
    authBrokerPath,
    defaultMcpDestination,
    unsafe,
    explicitTransportType,
    transportType,
    isHttp,
    isSse,
    isStdio,
    isEnvMandatory,
    envFilePath,
  };
}
