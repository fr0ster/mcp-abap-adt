/**
 * Hard mode: the tests reach a real server as an MCP client — a binary this
 * repository builds, started as a child, or a server already running.
 *
 * **Every launch is guarded** (plan C2 Step 4a, `launchedServers.ts`): the
 * parent's own guarded connection with the same credentials logs on right
 * before the launch, and every answer of the server is read for a credential
 * refusal. The only way to a server is a guarded launch (`launchStdio`,
 * `launchHttp`, `createHardModeClient`); the unguarded start is not exported.
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
 * entries point at this repository's package directories; it is removed
 * when the process exits.
 *
 * **Arguments**, as each binary's `--help` and its launcher's option parser
 * accept them (no `--transport`: a binary is its transport):
 * - every child: `--enable-data-tools`, so the data tools are served;
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
 * **No timer anywhere.** The MCP SDK's `Client` arms a request timer on
 * every request, so the tests speak JSON-RPC over the SDK's transports
 * themselves (`McpSession`): a request is answered by its matching
 * response, or ends with the transport's close.
 *
 * **Readiness**, raced against the child's exit — Jest's test timeout is the
 * only deadline:
 * - stdio: the answer to the MCP `initialize` sent over the child's stdin
 *   (`stdioReady`);
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
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema,
  InitializeResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  ListToolsResultSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpResult } from '../../../../lib/answer';
import { repositoryRoot } from '../../../helpers/repoRoot';
import { getTestDestination } from '../authHelpers';
import { loadTestConfig, testAuthBrokerPath } from '../configHelpers';
import {
  type ConfiguredSystemKind,
  configuredSystemKindOf,
  memberOf,
  NO_KIND_STATED,
  sessionVariables,
} from '../configuredSystemKind';
import {
  guardedServer,
  type LaunchedServer,
  launchGuarded,
} from '../launchedServers';
import { endTestConnection } from '../openConnections';
import { guardedTestConnection, refuseAfterMarker } from '../refusalGuard';
import { createTestConnectionAndSession } from '../sessionHelpers';

/** The repository root. */
const REPO = repositoryRoot(__dirname);

export interface HardModeConfig {
  enabled: boolean;
  transport: 'http' | 'sse' | 'stdio';
  http_url: string;
  sse_url: string;
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
  launch_http: boolean;
}

/** The server a launched or running hard-mode server is, to the tests. */
export type HardModeClient = LaunchedServer;

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('');
}

/** A parsed document's non-empty string member. */
function textAt(value: unknown, key: string): string | undefined {
  const at = memberOf(value, key);
  return typeof at === 'string' && at.trim() !== '' ? at : undefined;
}

/** The test config's hard-mode section (parsed YAML, read by shape). */
export function getHardModeConfig(
  cfg: unknown = loadTestConfig(),
): HardModeConfig {
  const hard =
    memberOf(memberOf(cfg, 'environment'), 'integration_hard_mode') ??
    memberOf(cfg, 'integration_hard_mode');
  const transport = (textAt(hard, 'transport') ?? 'http').toLowerCase();
  const headers: Record<string, string> = {};
  const given = memberOf(hard, 'headers');
  if (typeof given === 'object' && given !== null) {
    for (const [name, value] of Object.entries(given)) {
      if (typeof value === 'string') headers[name] = value;
    }
  }
  const mcpDestination = textAt(hard, 'mcp_destination');
  const envDestination = textAt(hard, 'env_destination');
  const envPath = textAt(hard, 'env_path');
  return {
    enabled: memberOf(hard, 'enabled') === true,
    transport:
      transport === 'sse' || transport === 'stdio' ? transport : 'http',
    http_url:
      textAt(hard, 'http_url') ?? 'http://127.0.0.1:3000/mcp/stream/http',
    sse_url: textAt(hard, 'sse_url') ?? 'http://127.0.0.1:3001/sse',
    ...(mcpDestination !== undefined && { mcp_destination: mcpDestination }),
    ...(envDestination !== undefined && { env_destination: envDestination }),
    ...(envPath !== undefined && { env_path: envPath }),
    ...(Object.keys(headers).length > 0 && { headers }),
    launch_http: memberOf(hard, 'launch_http') === true,
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
 * the OS temp directory, and removed when the process exits.
 */
export function siblingModules(): string {
  if (siblings !== undefined) return siblings;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-abap-adt-siblings-'));
  process.once('exit', () => {
    fs.rmSync(root, { recursive: true, force: true });
  });
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
// JSON-RPC over a transport, with no timer

/**
 * An MCP session spoken over one of the SDK's transports, with no timer: a
 * request resolves with its matching response and rejects with its error
 * answer, or when the transport closes.
 */
export class McpSession {
  private next = 1;
  private readonly pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  private closed: Error | undefined;
  private names: Set<string> = new Set();

  constructor(private readonly transport: Transport) {
    transport.onmessage = (message: JSONRPCMessage) => {
      if (isJSONRPCResultResponse(message)) {
        const waiting = this.take(message.id);
        waiting?.resolve(message.result);
      } else if (isJSONRPCErrorResponse(message)) {
        const waiting =
          message.id === undefined ? undefined : this.take(message.id);
        waiting?.reject(
          new Error(`${message.error.code}: ${message.error.message}`),
        );
      }
    };
    transport.onclose = () => {
      this.closed = new Error('the server closed the session');
      for (const waiting of this.pending.values()) waiting.reject(this.closed);
      this.pending.clear();
    };
  }

  private take(id: string | number) {
    if (typeof id !== 'number') return undefined;
    const waiting = this.pending.get(id);
    this.pending.delete(id);
    return waiting;
  }

  /** Sends `method` and resolves with its result. */
  async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.closed) throw this.closed;
    const id = this.next++;
    const answered = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      await this.transport.send({ jsonrpc: '2.0', id, method, params });
    } catch (error) {
      // Never sent: nothing will answer it, and the close must not reject
      // it unobserved.
      this.pending.delete(id);
      throw error;
    }
    return answered;
  }

  /** Starts the transport and completes the MCP handshake. */
  async initialize(): Promise<void> {
    await this.transport.start();
    const result = InitializeResultSchema.parse(
      await this.request('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'integration-hard-tester', version: '1.0.0' },
      }),
    );
    this.transport.setProtocolVersion?.(result.protocolVersion);
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  async listTools(): Promise<Tool[]> {
    const { tools } = ListToolsResultSchema.parse(
      await this.request('tools/list', {}),
    );
    this.names = new Set(tools.map((tool) => tool.name));
    return tools;
  }

  /** The tool names the last `listTools` answered. */
  toolNames(): ReadonlySet<string> {
    return this.names;
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<McpResult> {
    const result = CallToolResultSchema.parse(
      await this.request('tools/call', { name, arguments: { ...args } }),
    );
    return {
      isError: result.isError === true,
      content: result.content.flatMap((item) =>
        item.type === 'text'
          ? [{ type: 'text' as const, text: item.text }]
          : [],
      ),
    };
  }

  close(): Promise<void> {
    return this.transport.close();
  }
}

// ---------------------------------------------------------------------------
// A child, its readiness and its end

/** A launched child process. */
export interface Child {
  readonly process: ChildProcess;
  /** What it wrote on stderr so far. */
  stderr(): string;
  /** What it wrote on stdout so far, every byte (frames or not). */
  stdout(): string;
  /** Rejects when it exits, with its exit code and its stderr. */
  readonly exited: Promise<never>;
  /** Ends it with `SIGTERM` and waits for its exit; its exit code. No timer. */
  stop(): Promise<number | null>;
  /** Ends its stdin (the stdio server's own shutdown trigger) and waits for its exit; its exit code. */
  end(): Promise<number | null>;
}

/**
 * Starts `script` with `args` under this Node, its stdio piped, its stdout
 * and stderr captured. Exported for the launcher's own fake-child tests
 * only: an integration test reaches a server through a guarded launch
 * (`launchSites.test.ts` keeps it so).
 */
export function startChild(
  script: string,
  args: readonly string[],
  env: Record<string, string>,
  cwd: string = REPO,
): Child {
  return childOf(
    spawn(process.execPath, [script, ...args], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
}

/**
 * A `Child` over a process already started: its stdout and stderr captured,
 * its exit observed. `startChild` builds it over what it spawns; the
 * launcher's own tests build it over a stand-in process, to fire the
 * process's events in either order.
 */
export function childOf(child: ChildProcess): Child {
  let captured = '';
  let written = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    captured += chunk;
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    written += chunk.toString('utf8');
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
  // Its exit code once it closed (stdout and stderr drained).
  const closed = new Promise<number | null>((resolve) => {
    child.once('close', (code) => resolve(code));
  });
  const running = (): boolean =>
    child.exitCode === null && child.signalCode === null;
  return {
    process: child,
    stderr: () => captured,
    stdout: () => written,
    exited,
    stop: () => {
      if (running()) child.kill('SIGTERM');
      return closed;
    },
    end: () => {
      if (running()) child.stdin?.end();
      return closed;
    },
  };
}

/** An MCP client transport over a launched child's stdin and stdout. */
class ChildStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly buffer = new ReadBuffer();
  /** A write to the child's stdin failed: the child is going. */
  writeFailed = false;

  constructor(private readonly child: ChildProcess) {}

  async start(): Promise<void> {
    // A broken pipe would otherwise be an unhandled 'error' event; its
    // message is the system's, so only fixed words go on.
    this.child.stdin?.on('error', () => {
      this.writeFailed = true;
      this.onerror?.(new Error('writing to the server stdin failed'));
    });
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer.append(chunk);
      for (;;) {
        let message: JSONRPCMessage | null;
        try {
          message = this.buffer.readMessage();
        } catch {
          // A stray line on stdout is not a frame: skipped here, counted by
          // whoever reads the child's stdout.
          continue;
        }
        if (message === null) break;
        this.onmessage?.(message);
      }
    });
    // `close`, as the child's own `exited` reads it: after `exit`, its
    // stdio drained. `exited` is registered first, so its exit status
    // settles before the session's "closed".
    this.child.once('close', () => this.onclose?.());
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdin = this.child.stdin;
      if (stdin === null || stdin.destroyed) {
        this.writeFailed = true;
        reject(new Error('the child has no stdin'));
        return;
      }
      // The system's words stay out: a failed write is fixed words.
      stdin.write(serializeMessage(message), (error) => {
        if (error) {
          this.writeFailed = true;
          reject(new Error('writing to the server stdin failed'));
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    this.child.stdin?.end();
  }
}

/**
 * Ready over stdio: an MCP session over the child's stdin and stdout whose
 * `initialize` has been answered, raced against the child's exit.
 */
export async function stdioReady(child: Child): Promise<McpSession> {
  const transport = new ChildStdioTransport(child.process);
  const session = new McpSession(transport);
  // A session ended by the child going — its exit seen, or its stdin
  // refusing the write — answers with the exit status (`exited`, which
  // settles when the child closes), whichever of its events came first.
  const initialized = session
    .initialize()
    .catch((error: unknown) =>
      transport.writeFailed ||
      child.process.exitCode !== null ||
      child.process.signalCode !== null
        ? child.exited
        : Promise.reject(error),
    );
  await Promise.race([initialized, child.exited]);
  return session;
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

/** A session and the child it speaks to, as a server the tests call. */
async function served(
  session: McpSession,
  child: Child | undefined,
): Promise<LaunchedServer> {
  await session.listTools();
  return {
    toolNames: session.toolNames(),
    listTools: () => session.listTools(),
    call: (tool, args) => session.callTool(tool, args),
    child,
    close: async () => {
      try {
        await child?.stop();
      } finally {
        await session.close();
      }
    },
  };
}

/**
 * Every child serves the data tools: the live cases of `GetSqlQuery`,
 * `GetTableContents` and `HandlerGetData` call them, and a binary serves
 * them only with this flag.
 */
const DATA_TOOLS_FLAG = '--enable-data-tools';

/** What a stdio child is started with besides its kind: its destination arguments. */
export interface StdioLaunch {
  set: HardModeSet;
  kind: ConfiguredSystemKind;
  /** `--mcp` / `--env` / `--env-path`, `--auth-broker-path`, … */
  args: readonly string[];
  /** The parent's own guarded logon with the same credentials, right before the launch. */
  logOn: () => Promise<void>;
}

/** The stdio binary of `set` for `kind`, once it answered `initialize`. Not exported: unguarded. */
async function startStdio(spec: StdioLaunch): Promise<LaunchedServer> {
  const child = startChild(
    binaryPath('stdio', spec.set),
    [`--system-type=${spec.kind}`, DATA_TOOLS_FLAG, ...spec.args],
    childEnvironment(),
  );
  try {
    return await served(await stdioReady(child), child);
  } catch (error) {
    await child.stop();
    throw error;
  }
}

/** Launches the stdio binary of `set` for `kind`, guarded (`launchGuarded`). */
export function launchStdio(spec: StdioLaunch): Promise<LaunchedServer> {
  return launchGuarded({ logOn: spec.logOn, launch: () => startStdio(spec) });
}

/** What a Streamable HTTP child is started with besides its kind: the credential headers. */
export interface HttpLaunch {
  set: HardModeSet;
  kind: ConfiguredSystemKind;
  headers: Record<string, string>;
  /** The parent's own guarded logon with the same credentials, right before the launch. */
  logOn: () => Promise<void>;
}

/** The Streamable HTTP binary of `set` for `kind`, once it listens. Not exported: unguarded. */
async function startHttp(spec: HttpLaunch): Promise<LaunchedServer> {
  const port = await freePort();
  const child = startChild(
    binaryPath('http', spec.set),
    [
      `--system-type=${spec.kind}`,
      DATA_TOOLS_FLAG,
      '--host=127.0.0.1',
      `--port=${port}`,
    ],
    childEnvironment(),
  );
  try {
    await httpReady(child);
    const session = new McpSession(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp/stream/http`),
        { requestInit: { headers: spec.headers } },
      ),
    );
    await session.initialize();
    return await served(session, child);
  } catch (error) {
    await child.stop();
    throw error;
  }
}

/** Launches the Streamable HTTP binary of `set` for `kind`, guarded (`launchGuarded`). */
export function launchHttp(spec: HttpLaunch): Promise<LaunchedServer> {
  return launchGuarded({ logOn: spec.logOn, launch: () => startHttp(spec) });
}

/** A server started from a script: a binary, or a source entry under tsx. */
export interface ScriptLaunch {
  /** What runs under this Node: the script, then its arguments. */
  argv: readonly [string, ...string[]];
  env: Record<string, string>;
  /** Its working directory; the repository when absent. */
  cwd?: string;
  /** The parent's own guarded logon with the same credentials, right before the launch. */
  logOn: () => Promise<void>;
}

/** Launches a stdio server from a script, guarded; ready once it answered `initialize`. */
export function launchStdioScript(spec: ScriptLaunch): Promise<LaunchedServer> {
  return launchGuarded({
    logOn: spec.logOn,
    launch: async () => {
      const [script, ...args] = spec.argv;
      const child = startChild(script, args, spec.env, spec.cwd);
      try {
        return await served(await stdioReady(child), child);
      } catch (error) {
        await child.stop();
        throw error;
      }
    },
  });
}

/** A Streamable HTTP server launched from a script: one child, a guarded session per set of headers. */
export interface GuardedHttpServer {
  readonly child: Child;
  /** A session with `headers`, its answers read for a credential refusal; its close closes it alone. */
  session(headers: Record<string, string>): Promise<LaunchedServer>;
  /** Closes every session and stops the child; its exit code. */
  close(): Promise<number | null>;
}

/**
 * Launches a Streamable HTTP server from a script, guarded: the parent logs
 * on first, the child is ready at its listening line, and every session's
 * answers are read — a refusal on any stops the child and the sessions.
 */
export async function launchHttpScript(
  spec: ScriptLaunch & { url: URL },
): Promise<GuardedHttpServer> {
  refuseAfterMarker('a launch');
  await spec.logOn();
  refuseAfterMarker('a launch');
  const [script, ...args] = spec.argv;
  const child = startChild(script, args, spec.env, spec.cwd);
  try {
    await httpReady(child);
  } catch (error) {
    await child.stop();
    throw error;
  }
  const sessions: McpSession[] = [];
  const close = async (): Promise<number | null> => {
    const code = await child.stop();
    await Promise.allSettled(sessions.map((each) => each.close()));
    return code;
  };
  return {
    child,
    session: async (headers) => {
      refuseAfterMarker('a session');
      const session = new McpSession(
        new StreamableHTTPClientTransport(spec.url, {
          requestInit: { headers },
        }),
      );
      sessions.push(session);
      await session.initialize();
      const plain = await served(session, undefined);
      // A refusal stops the child and every session; closing one session
      // closes only it.
      const guarded = guardedServer(plain, async () => {
        await close();
      });
      return { ...guarded, close: () => session.close() };
    },
    close,
  };
}

// ---------------------------------------------------------------------------
// From the test config

/**
 * The stdio child's destination arguments, as the test config states them:
 * the stores (`--unsafe`, `--auth-broker-path`), the destination, and the
 * connection type when stated.
 */
export function destinationArgs(hard: HardModeConfig, cfg: unknown): string[] {
  const broker = memberOf(cfg, 'auth_broker');
  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    memberOf(broker, 'unsafe') === true ||
    memberOf(broker, 'unsafe_session_store') === true;
  const args = useUnsafe ? ['--unsafe'] : [];
  const brokerPath = testAuthBrokerPath(cfg);
  if (brokerPath) args.push(`--auth-broker-path=${brokerPath}`);
  const environment = memberOf(cfg, 'environment');
  const env = textAt(environment, 'env');
  if (hard.mcp_destination) {
    args.push(`--mcp=${hard.mcp_destination}`);
  } else if (hard.env_destination) {
    args.push(`--env=${hard.env_destination}`);
  } else if (hard.env_path) {
    args.push(`--env-path=${path.resolve(hard.env_path)}`);
  } else if (env !== undefined) {
    // A sessions-store name goes to the server as --env (resolved there), a path as --env-path.
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
  const connectionType = memberOf(environment, 'connection_type');
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
 * The parent's own logon with the test config's own connection
 * (`createTestConnectionAndSession`: the destination, or `environment.env`),
 * guarded, logged off again — for a server launched with that same
 * destination.
 */
export async function testConnectionLogOn(): Promise<void> {
  const { connection } = await createTestConnectionAndSession();
  await endTestConnection(connection);
}

/**
 * The parent's own logon with the test destination's credential: a guarded
 * connection that connects and logs off again. A refusal latches the marker.
 */
function parentLogOn(kind: ConfiguredSystemKind): () => Promise<void> {
  return async () => {
    const destination = await getTestDestination();
    if (destination === null) {
      throw new Error(
        "hard mode: the test config names no destination for the parent's logon",
      );
    }
    const own = guardedTestConnection(
      destination.settings,
      destination.credential,
      { kind: kind === 'cloud' ? 'cloud' : 'onprem' },
    );
    await own.connect();
    await endTestConnection(own);
  };
}

/**
 * The hard-mode server of the test config, always guarded: the stdio binary
 * of `set`, the Streamable HTTP binary of `set` (`launch_http`), or a server
 * already running (`http_url`, `sse_url`) whose answers are read the same
 * way.
 */
export async function createHardModeClient(
  set: HardModeSet,
  cfg: unknown = loadTestConfig(),
): Promise<HardModeClient> {
  const hard = getHardModeConfig(cfg);
  const kind = launchKind(cfg);
  const logOn = parentLogOn(kind);
  if (hard.transport === 'stdio') {
    return launchStdio({ set, kind, args: destinationArgs(hard, cfg), logOn });
  }
  if (hard.transport === 'http' && hard.launch_http) {
    return launchHttp({
      set,
      kind,
      headers: hard.headers ?? sessionHeaders(cfg),
      logOn,
    });
  }
  const options = hard.headers
    ? { requestInit: { headers: hard.headers } }
    : undefined;
  return launchGuarded({
    logOn,
    launch: async () => {
      const session = new McpSession(
        hard.transport === 'http'
          ? new StreamableHTTPClientTransport(new URL(hard.http_url), options)
          : new SSEClientTransport(new URL(hard.sse_url), options),
      );
      await session.initialize();
      return served(session, undefined);
    },
  });
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

/** Calls the first candidate the server serves; a failed answer throws its text. */
export async function callTool(
  server: HardModeClient,
  candidates: string[],
  args: Record<string, unknown>,
): Promise<McpResult> {
  const selected = candidates.find((name) => server.toolNames.has(name));
  if (!selected) {
    throw new Error(
      `No matching tool found. Candidates: ${candidates.join(', ')}`,
    );
  }
  const result = await server.call(selected, args);
  if (result.isError) {
    const text = result.content.map((c) => c.text).join('\n');
    throw new Error(text || `${selected} returned MCP error`);
  }
  return result;
}

export function parseToolText(result: McpResult): string {
  return result.content
    .map((c) => c.text)
    .join('\n')
    .trim();
}
