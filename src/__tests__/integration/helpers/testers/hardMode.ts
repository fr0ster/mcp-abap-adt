import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadTestConfig, testAuthBrokerPath } from '../configHelpers';

export interface HardModeConfig {
  enabled: boolean;
  transport: 'http' | 'sse' | 'stdio';
  http_url?: string;
  sse_url?: string;
  // stdio only: server launch parameters
  stdio_command?: string;
  mcp_destination?: string; // --mcp=<dest> (auth-broker / service key)
  env_destination?: string; // --env=<dest> (session .env from default folder)
  env_path?: string; // --env-path=<path> (explicit .env file)
  /**
   * stdio only: the exposition the spawned server serves.
   *
   * `high` and `low` are mutually exclusive — `validateExposition` refuses the
   * pair and the launcher exits — so there is no value that serves both tiers,
   * and asking for both was never a test of anything. A run covers one tier;
   * set this to `readonly,low` for the low one.
   */
  exposition?: string;
  // http/sse only: auth headers sent to a running server
  headers?: Record<string, string>;
  /**
   * http only: launch the server binary with `--transport=http` on a free
   * port of this host, with the destination and exposition stdio would use,
   * instead of connecting to a server already running at `http_url`.
   */
  launch_http?: boolean;
}

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('');
}

export function getHardModeConfig(): HardModeConfig {
  const cfg = loadTestConfig();
  const hard =
    cfg?.environment?.integration_hard_mode || cfg?.integration_hard_mode || {};

  const transport = String(hard.transport || 'http').toLowerCase();
  const normalizedTransport =
    transport === 'sse' || transport === 'stdio' ? transport : 'http';

  // Build headers map from YAML (supports arbitrary x-sap-* / x-mcp-* headers)
  const headers: Record<string, string> = {};
  if (hard.headers && typeof hard.headers === 'object') {
    for (const [k, v] of Object.entries(hard.headers)) {
      if (typeof v === 'string') headers[k] = v;
    }
  }

  return {
    enabled: hard.enabled === true,
    transport: normalizedTransport,
    http_url: hard.http_url || 'http://127.0.0.1:3000/mcp/stream/http',
    sse_url: hard.sse_url || 'http://127.0.0.1:3001/sse',
    stdio_command: hard.stdio_command || process.execPath,
    mcp_destination: hard.mcp_destination,
    env_destination: hard.env_destination,
    env_path: hard.env_path,
    exposition:
      typeof hard.exposition === 'string' && hard.exposition.trim() !== ''
        ? hard.exposition.trim()
        : 'readonly,high',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    launch_http: hard.launch_http === true,
  };
}

/**
 * The launcher's arguments every launched server shares: the exposition, the
 * stores soft mode reads, and the destination — the same file soft mode reads.
 */
function launcherArgs(hard: HardModeConfig): string[] {
  const cfg = loadTestConfig();
  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    cfg?.auth_broker?.unsafe === true ||
    cfg?.auth_broker?.unsafe_session_store === true;
  const args = [
    path.resolve(process.cwd(), 'server/dist/launcher.js'),
    `--exposition=${hard.exposition}`,
    ...(useUnsafe ? ['--unsafe'] : []),
  ];
  const brokerPath = testAuthBrokerPath(cfg);
  if (brokerPath) args.push(`--auth-broker-path=${brokerPath}`);
  if (hard.mcp_destination) {
    args.push(`--mcp=${hard.mcp_destination}`);
  } else if (hard.env_destination) {
    args.push(`--env=${hard.env_destination}`);
  } else if (hard.env_path) {
    args.push(`--env-path=${path.resolve(String(hard.env_path))}`);
  } else if (cfg?.environment?.env) {
    // A sessions-store name goes to the server as --env (resolved there), a path as --env-path.
    const env = String(cfg.environment.env);
    args.push(
      /[\\/]/.test(env) || env.startsWith('.') || env.startsWith('~')
        ? `--env-path=${path.resolve(env)}`
        : `--env=${env}`,
    );
  } else {
    // No .env from the working directory: the server reads none there
    // since 16.0.0, so neither does the harness.
    throw new Error(
      'hard mode needs a destination: integration_hard_mode.mcp_destination, env_destination or env_path, or environment.env',
    );
  }
  return args;
}

/**
 * The spawned server's environment: the client SDK's safe default, plus the
 * switches a run asks for (module resolution, the wire log, debugger ids).
 */
function serverEnvironment(): Record<string, string> {
  const env: Record<string, string> = getDefaultEnvironment();
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      (name === 'NODE_PATH' ||
        name.startsWith('DEBUG_') ||
        name.startsWith('SAP_DEBUG_'))
    ) {
      env[name] = value;
    }
  }
  return env;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/** Launches the server over Streamable HTTP and waits until its health endpoint answers. */
async function launchHttpServer(
  hard: HardModeConfig,
): Promise<{ url: URL; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn(
    String(hard.stdio_command || process.execPath),
    [
      ...launcherArgs(hard),
      '--transport=http',
      '--http-host=127.0.0.1',
      `--http-port=${port}`,
    ],
    { cwd: process.cwd(), env: serverEnvironment(), stdio: 'inherit' },
  );
  let exited: string | undefined;
  child.once('exit', (code, signal) => {
    exited = `the server exited (${code ?? signal})`;
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) throw new Error(exited);
    try {
      const health = await fetch(`${base}/mcp/health`);
      if (health.ok) return { url: new URL(`${base}/mcp/stream/http`), child };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill('SIGTERM');
  throw new Error(`the server did not answer on ${base} within 30 seconds`);
}

/** Ends a launched server and waits for it: its shutdown undoes what it holds. */
function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 60_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

export function isHardModeEnabled(): boolean {
  return getHardModeConfig().enabled;
}

export function resolveEntityFromHandlerName(handlerName: string): string {
  let normalized = handlerName.toLowerCase();
  normalized = normalized.replace(/^create_/, '');
  normalized = normalized.replace(/^update_/, '');
  normalized = normalized.replace(/^delete_/, '');
  normalized = normalized.replace(/_low$/, '');
  return toPascalCase(normalized);
}

export async function createHardModeClient(): Promise<{
  client: Client;
  toolNames: Set<string>;
  close: () => Promise<void>;
}> {
  const hard = getHardModeConfig();
  const client = new Client(
    { name: 'integration-hard-tester', version: '1.0.0' },
    { capabilities: {} },
  );

  let launched: ChildProcess | undefined;
  if (hard.transport === 'http') {
    let url = new URL(hard.http_url!);
    if (hard.launch_http) {
      const server = await launchHttpServer(hard);
      launched = server.child;
      url = server.url;
    }
    await client.connect(
      new StreamableHTTPClientTransport(
        url,
        hard.headers ? { requestInit: { headers: hard.headers } } : undefined,
      ),
    );
  } else if (hard.transport === 'sse') {
    await client.connect(
      new SSEClientTransport(
        new URL(hard.sse_url!),
        hard.headers ? { requestInit: { headers: hard.headers } } : undefined,
      ),
    );
  } else {
    // stdio: launch server process with connection parameters
    // The standalone server is its own package now (@mcp-abap-adt/core,
    // AGPL-3.0-only) and builds into server/dist. Hard mode spawns that binary,
    // so it needs the server package built, not just this one.
    const args = [...launcherArgs(hard), '--transport=stdio'];
    await client.connect(
      new StdioClientTransport({
        command: String(hard.stdio_command || process.execPath),
        args,
        cwd: process.cwd(),
        env: serverEnvironment(),
        stderr: 'inherit',
      }),
    );
  }

  const listed = await client.listTools();
  const toolNames = new Set((listed?.tools || []).map((t) => t.name));

  return {
    client,
    toolNames,
    close: async () => {
      try {
        await client.close();
      } finally {
        if (launched) await stopChild(launched);
      }
    },
  };
}

export function toolCandidates(
  step:
    | 'validate'
    | 'create'
    | 'lock'
    | 'update'
    | 'unlock'
    | 'activate'
    | 'delete',
  entity: string,
  mode: 'high' | 'low',
  handlerName: string,
): string[] {
  const cap = step[0].toUpperCase() + step.slice(1);
  const low = `${cap}${entity}Low`;
  const high = `${cap}${entity}`;

  if (step === 'delete' && handlerName.includes('behavior_implementation')) {
    return ['DeleteClass', 'DeleteClassLow', high, low];
  }

  if (mode === 'high') {
    return [high, low];
  }
  return [low, high];
}

export async function callTool(
  client: Client,
  toolNames: Set<string>,
  candidates: string[],
  args: Record<string, unknown>,
) {
  const selected = candidates.find((name) => toolNames.has(name));
  if (!selected) {
    throw new Error(
      `No matching tool found. Candidates: ${candidates.join(', ')}`,
    );
  }
  const result = await client.callTool({ name: selected, arguments: args });
  if (result?.isError) {
    const text = ((result.content || []) as any[])
      .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
      .join('\n');
    throw new Error(text || `${selected} returned MCP error`);
  }
  return result;
}

export function parseToolText(result: any): string {
  return (result?.content || [])
    .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
    .join('\n')
    .trim();
}
