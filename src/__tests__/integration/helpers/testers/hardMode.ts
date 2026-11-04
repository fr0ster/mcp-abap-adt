/**
 * Hard mode: the tests reach a real server as an MCP client — a binary this
 * repository builds, started as a child, or a server already running.
 *
 * **The binaries, from the packages' `bin` fields** (`binaryPath`), started
 * from the build (`npm run build` first) with `process.execPath`:
 * - full set: stdio `mcp-abap-adt` (`server/`), Streamable HTTP
 *   `mcp-abap-adt-http` (`http/`);
 * - compact set: stdio `mcp-abap-adt-compact` (`compact/`), Streamable HTTP
 *   `mcp-abap-adt-compact-http` (`compact-http/`).
 * A checkout has none of its own packages installed by name, so a child
 * resolves its siblings through `NODE_PATH` (`siblingModules`): a directory
 * of this process under the OS temp directory whose `@mcp-abap-adt/<name>`
 * entries point at this repository's package directories.
 *
 * **Arguments**, as each binary's `--help` and its launcher's option parser
 * accept them (no `--transport`: a binary is its transport):
 * - every child: `--system-type=<onprem|cloud|legacy>`, from
 *   `configuredSystemKind()` — never a default; with no kind stated, nothing
 *   is launched;
 * - stdio: the destination — `--mcp=<destination>`, `--env=<name>` or
 *   `--env-path=<file>` — with `--auth-broker-path=<dir>`, `--unsafe` and
 *   `--connection-type=<http|rfc>` as the test config states them;
 * - Streamable HTTP: `--host=127.0.0.1 --port=<free port>`; its credential
 *   travels in each request's headers (`x-sap-url`, optional
 *   `x-sap-client`, and `x-sap-login` with `x-sap-password` or
 *   `x-sap-jwt-token`), read from the session file at run time — never
 *   from a committed file or a command line.
 *
 * **Readiness**, raced against the child's exit; no polling, no timer —
 * Jest's test timeout is the only deadline:
 * - stdio: the answer to the MCP `initialize` the client sends over the
 *   child's stdin (`stdioReady`);
 * - Streamable HTTP: the listening line the server writes on stderr
 *   (`httpReady`).
 * An exit before readiness rejects at once with the exit code and the
 * captured stderr. **Termination**: `SIGTERM`, then a wait for the exit
 * event; no forced-kill timer (`stop`).
 */

import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createServer } from 'node:net';
import * as os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { loadTestConfig, testAuthBrokerPath } from '../configHelpers';
import {
  type ConfiguredSystemKind,
  configuredSystemKindOf,
  memberOf,
  NO_KIND_STATED,
  sessionVariables,
} from '../configuredSystemKind';

/** The repository root. */
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');

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
  // http/sse only: auth headers sent to a running server
  headers?: Record<string, string>;
  /**
   * http only: launch the Streamable HTTP binary on a free port of this
   * host, its credential in the headers read from the destination's session
   * file, instead of connecting to a server already running at `http_url`.
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

export function getHardModeConfig(cfg: any = loadTestConfig()): HardModeConfig {
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
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    launch_http: hard.launch_http === true,
  };
}

// ---------------------------------------------------------------------------
// The binaries

/** Which tools a launched server serves: the full binaries or the compact ones. */
export type HardModeSet = 'full' | 'compact';

/** The transports hard mode launches. */
export type LaunchTransport = 'stdio' | 'http';

/** Each binary's package directory and command name (its `bin` field's key). */
const BINARIES: Record<
  LaunchTransport,
  Record<HardModeSet, { dir: string; command: string }>
> = {
  stdio: {
    full: { dir: 'server', command: 'mcp-abap-adt' },
    compact: { dir: 'compact', command: 'mcp-abap-adt-compact' },
  },
  http: {
    full: { dir: 'http', command: 'mcp-abap-adt-http' },
    compact: { dir: 'compact-http', command: 'mcp-abap-adt-compact-http' },
  },
};

/** The JSON a package manifest holds, read from the repository. */
function manifestOf(dir: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(REPO, dir, 'package.json'), 'utf8'),
  );
}

/** The binary a transport and set start: the path its package's `bin` field names. */
export function binaryPath(
  transport: LaunchTransport,
  set: HardModeSet,
): string {
  const { dir, command } = BINARIES[transport][set];
  const bin = memberOf(memberOf(manifestOf(dir), 'bin'), command);
  if (typeof bin !== 'string') {
    throw new Error(`${dir}/package.json declares no bin ${command}`);
  }
  return path.join(REPO, dir, bin);
}

/** The repository's own packages by directory, as a launched binary needs them. */
const PACKAGE_DIRS = [
  '.',
  'background-runs-memory',
  'responsible-rules',
  'compact-readonly-entries',
  'compact-modify',
  'server-runtime',
  'server',
  'http',
  'sse',
  'compact',
  'compact-http',
  'compact-sse',
];

let siblings: string | undefined;

/**
 * A directory for a child's `NODE_PATH`: `@mcp-abap-adt/<name>` → this
 * repository's package of that name, so a binary run from the build resolves
 * its siblings as an installed release would. Made once per process, under
 * the OS temp directory.
 */
export function siblingModules(): string {
  if (siblings !== undefined) return siblings;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-abap-adt-siblings-'));
  fs.mkdirSync(path.join(root, '@mcp-abap-adt'));
  for (const dir of PACKAGE_DIRS) {
    const name = memberOf(manifestOf(dir), 'name');
    if (typeof name !== 'string' || !name.startsWith('@mcp-abap-adt/')) {
      throw new Error(`${dir}/package.json names no @mcp-abap-adt package`);
    }
    fs.symlinkSync(
      path.join(REPO, dir),
      path.join(root, name),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  siblings = root;
  return root;
}

/**
 * A launched child's environment: the client SDK's safe default, the
 * siblings' `NODE_PATH`, and the switches a run asks for (the wire log,
 * debugger ids). `SAP_SYSTEM_TYPE` is not passed: the kind is a flag.
 */
export function childEnvironment(): Record<string, string> {
  const env: Record<string, string> = getDefaultEnvironment();
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value !== undefined &&
      (name.startsWith('DEBUG_') || name.startsWith('SAP_DEBUG_'))
    ) {
      env[name] = value;
    }
  }
  const inherited = process.env.NODE_PATH;
  env.NODE_PATH =
    inherited !== undefined && inherited !== ''
      ? `${siblingModules()}${path.delimiter}${inherited}`
      : siblingModules();
  return env;
}

// ---------------------------------------------------------------------------
// A child, its readiness and its end

/** A launched child process. */
export interface Child {
  readonly process: ChildProcess;
  /** What it wrote on stderr so far. */
  stderr(): string;
  /** Rejects when it exits, with its exit code and its stderr. */
  readonly exited: Promise<never>;
  /** Ends it with `SIGTERM` and waits for its exit event; no timer. */
  stop(): Promise<void>;
}

/** Starts `script` with `args` under this Node, its stdin and stdout piped, its stderr captured. */
export function startChild(
  script: string,
  args: readonly string[],
  env: Record<string, string>,
): Child {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: REPO,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let captured = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    captured += chunk;
  });
  const exited = new Promise<never>((_, reject) => {
    // `close`, not `exit`: its stderr has been read whole by then.
    child.once('close', (code, signal) => {
      reject(
        new Error(
          `the child exited (${code ?? signal}) before it was stopped:\n${captured}`,
        ),
      );
    });
  });
  // Observed here: an exit after readiness is the stop's, not a failure.
  exited.catch(() => undefined);
  return {
    process: child,
    stderr: () => captured,
    exited,
    stop: () =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
          }),
  };
}

/** An MCP client transport over a launched child's stdin and stdout. */
class ChildStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly buffer = new ReadBuffer();

  constructor(private readonly child: ChildProcess) {}

  async start(): Promise<void> {
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer.append(chunk);
      for (
        let message = this.buffer.readMessage();
        message !== null;
        message = this.buffer.readMessage()
      ) {
        this.onmessage?.(message);
      }
    });
    this.child.once('exit', () => this.onclose?.());
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdin = this.child.stdin;
      if (stdin === null || stdin.destroyed) {
        reject(new Error('the child has no stdin'));
        return;
      }
      stdin.write(serializeMessage(message), (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  async close(): Promise<void> {
    this.child.stdin?.end();
  }
}

/**
 * Ready over stdio: `client` connected through the child's stdin and
 * stdout — the answer to its `initialize` has arrived — raced against the
 * child's exit.
 */
export async function stdioReady(child: Child, client: Client): Promise<void> {
  await Promise.race([
    client.connect(new ChildStdioTransport(child.process)),
    child.exited,
  ]);
}

/** The line the Streamable HTTP server writes once it listens. */
export const LISTENING_LINE = '[StreamableHttpServer] Server started on ';

/**
 * Ready over Streamable HTTP: the listening line has arrived on the child's
 * stderr — the address after it — raced against the child's exit.
 */
export function httpReady(child: Child): Promise<string> {
  const listening = new Promise<string>((resolve) => {
    let pending = '';
    const read = (chunk: Buffer | string): void => {
      pending += chunk.toString();
      for (
        let end = pending.indexOf('\n');
        end >= 0;
        end = pending.indexOf('\n')
      ) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line.startsWith(LISTENING_LINE)) {
          child.process.stderr?.off('data', read);
          resolve(line.slice(LISTENING_LINE.length));
          return;
        }
      }
    };
    child.process.stderr?.on('data', read);
  });
  return Promise.race([listening, child.exited]);
}

/** A port free on 127.0.0.1 now: a listener on port 0, closed again. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        address !== null && typeof address === 'object'
          ? resolve(address.port)
          : reject(new Error('the probe listener has no port')),
      );
    });
  });
}

/** A launched server, connected as an MCP client. */
export interface Launched {
  client: Client;
  toolNames: Set<string>;
  child: Child;
  /** Closes the client, ends the child with `SIGTERM` and waits for its exit. */
  close(): Promise<void>;
}

const newClient = (): Client =>
  new Client(
    { name: 'integration-hard-tester', version: '1.0.0' },
    { capabilities: {} },
  );

async function listed(
  client: Client,
  child: Child,
): Promise<Omit<Launched, 'client' | 'child'>> {
  const tools = await client.listTools();
  return {
    toolNames: new Set(tools.tools.map((t) => t.name)),
    close: async () => {
      try {
        await child.stop();
      } finally {
        await client.close();
      }
    },
  };
}

/** What a stdio child is started with besides its kind: its destination arguments. */
export interface StdioLaunch {
  set: HardModeSet;
  kind: ConfiguredSystemKind;
  /** `--mcp` / `--env` / `--env-path`, `--auth-broker-path`, … */
  args: readonly string[];
}

/** Starts the stdio binary of `set` for `kind` and connects to it once it answered `initialize`. */
export async function launchStdio(spec: StdioLaunch): Promise<Launched> {
  const child = startChild(
    binaryPath('stdio', spec.set),
    [`--system-type=${spec.kind}`, ...spec.args],
    childEnvironment(),
  );
  const client = newClient();
  try {
    await stdioReady(child, client);
    return { client, child, ...(await listed(client, child)) };
  } catch (error) {
    await child.stop();
    throw error;
  }
}

/** What a Streamable HTTP child is started with besides its kind: the credential headers. */
export interface HttpLaunch {
  set: HardModeSet;
  kind: ConfiguredSystemKind;
  headers: Record<string, string>;
}

/** Starts the Streamable HTTP binary of `set` for `kind` and connects once it listens. */
export async function launchHttp(spec: HttpLaunch): Promise<Launched> {
  const port = await freePort();
  const child = startChild(
    binaryPath('http', spec.set),
    [`--system-type=${spec.kind}`, '--host=127.0.0.1', `--port=${port}`],
    childEnvironment(),
  );
  const client = newClient();
  try {
    await httpReady(child);
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp/stream/http`),
        { requestInit: { headers: spec.headers } },
      ),
    );
    return { client, child, ...(await listed(client, child)) };
  } catch (error) {
    await child.stop();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// From the test config

/**
 * The stdio child's destination arguments, as the test config states them:
 * the stores (`--unsafe`, `--auth-broker-path`), the destination, and the
 * connection type when stated.
 */
export function destinationArgs(hard: HardModeConfig, cfg: any): string[] {
  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    cfg?.auth_broker?.unsafe === true ||
    cfg?.auth_broker?.unsafe_session_store === true;
  const args = useUnsafe ? ['--unsafe'] : [];
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
    const isPath =
      env.includes('/') ||
      env.includes('\\') ||
      env.startsWith('.') ||
      env.startsWith('~');
    args.push(isPath ? `--env-path=${path.resolve(env)}` : `--env=${env}`);
  } else {
    // No .env from the working directory: the server reads none there
    // since 16.0.0, so neither does the harness.
    throw new Error(
      'hard mode needs a destination: integration_hard_mode.mcp_destination, env_destination or env_path, or environment.env',
    );
  }
  const connectionType = cfg?.environment?.connection_type;
  if (connectionType === 'http' || connectionType === 'rfc') {
    args.push(`--connection-type=${connectionType}`);
  }
  return args;
}

/**
 * The Streamable HTTP child's credential headers, from the destination's
 * session file at run time: `x-sap-url`, `x-sap-client` when stated, and
 * the token or the login and password.
 */
export function sessionHeaders(cfg: unknown): Record<string, string> {
  const session = sessionVariables(cfg);
  const url = session.SAP_URL;
  if (url === undefined || url === '') {
    throw new Error('hard mode over HTTP: the session file names no SAP_URL');
  }
  const headers: Record<string, string> = { 'x-sap-url': url };
  if (session.SAP_CLIENT) headers['x-sap-client'] = session.SAP_CLIENT;
  if (session.SAP_JWT_TOKEN) {
    headers['x-sap-jwt-token'] = session.SAP_JWT_TOKEN;
  } else if (session.SAP_USERNAME && session.SAP_PASSWORD) {
    headers['x-sap-login'] = session.SAP_USERNAME;
    headers['x-sap-password'] = session.SAP_PASSWORD;
  } else {
    throw new Error(
      'hard mode over HTTP: the session file holds neither SAP_JWT_TOKEN nor SAP_USERNAME with SAP_PASSWORD',
    );
  }
  return headers;
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

/** The kind a launched child is started for, or a refusal before anything is spawned. */
function launchKind(cfg: unknown): ConfiguredSystemKind {
  const kind = configuredSystemKindOf(cfg);
  if (kind === undefined) {
    throw new Error(`hard mode launches nothing: ${NO_KIND_STATED}`);
  }
  return kind;
}

/**
 * The hard-mode client of the test config: the stdio binary of `set`, the
 * Streamable HTTP binary of `set` (`launch_http`), or a server already
 * running (`http_url`, `sse_url`).
 */
export async function createHardModeClient(
  set: HardModeSet,
  cfg: any = loadTestConfig(),
): Promise<{
  client: Client;
  toolNames: Set<string>;
  close: () => Promise<void>;
}> {
  const hard = getHardModeConfig(cfg);
  if (hard.transport === 'stdio') {
    const kind = launchKind(cfg);
    return launchStdio({ set, kind, args: destinationArgs(hard, cfg) });
  }
  if (hard.transport === 'http' && hard.launch_http) {
    const kind = launchKind(cfg);
    return launchHttp({
      set,
      kind,
      headers: hard.headers ?? sessionHeaders(cfg),
    });
  }
  const client = newClient();
  if (hard.transport === 'http') {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(hard.http_url ?? ''),
        hard.headers ? { requestInit: { headers: hard.headers } } : undefined,
      ),
    );
  } else {
    await client.connect(
      new SSEClientTransport(
        new URL(hard.sse_url ?? ''),
        hard.headers ? { requestInit: { headers: hard.headers } } : undefined,
      ),
    );
  }
  const tools = await client.listTools();
  return {
    client,
    toolNames: new Set(tools.tools.map((t) => t.name)),
    close: () => client.close(),
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
  _mode: 'high',
  handlerName: string,
): string[] {
  // The full binaries serve no low set since 19.0.0: the candidates are
  // the high tools only.
  const cap = step[0].toUpperCase() + step.slice(1);
  const high = `${cap}${entity}`;

  if (step === 'delete' && handlerName.includes('behavior_implementation')) {
    return ['DeleteClass', high];
  }
  return [high];
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
