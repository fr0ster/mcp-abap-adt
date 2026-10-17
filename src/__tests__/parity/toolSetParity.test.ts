/**
 * Full and compact behave alike on every transport: the tool set is the only input of a launcher that differs.
 *
 * One parametrised suite runs the same scenario on stdio, Streamable HTTP and
 * SSE, each through two of the six `main`s — the full one as its bin calls
 * it (`fullToolSet`), the compact one through its own package's launcher
 * (`compact`, `compact-http`, `compact-sse`) — and asserts that everything
 * observed is equal except the tool list:
 *
 * - the help (but for the binary's name and the exposition's row and
 *   section), the `--conf` template's keys and values (but for `exposition`),
 *   `--transport` and an option of another binary stopping the start;
 * - the credentials: what reaches an ADT stand-in for a tool call — the
 *   destination's user (stdio), the `x-sap-*` basic user and the
 *   `x-sap-jwt-token` (Streamable HTTP, SSE);
 * - the failures: the system refusing the credential (`401`) answers the same
 *   tool failure; a request without credentials, or with
 *   `x-mcp-destination`, the same `400` (Streamable HTTP, SSE); a call with
 *   no destination the same `inspection_only` refusal (stdio);
 * - and, with `debug` in the exposition (full: `readonly,debug`, compact:
 *   `ro,debug`), the debugger's tools on each.
 *
 * The cancellation case: a call cancelled after its connection is ready —
 * while the system lookup an ABAP Cloud call makes first is held at the
 * stand-in — by an MCP cancel (sse) or a dropped request (http) reaches its
 * tool once the lookup is answered, the same on both sets. The
 * shutdown cases: a write whose update is held at the stand-in
 * when the shutdown starts runs to its end — the `UNLOCK` lands, then the
 * session's logoff, exit `0` — and a call arriving after the latch reaches no
 * tool, the same on both sets. Every case runs
 * in this process against real sockets (HTTP, SSE) or an in-memory MCP
 * transport (stdio), with the process's edges given to `main`.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { load } from 'js-yaml';
import * as compactStdio from '../../../compact/src/launcher';
import * as compactHttp from '../../../compact-http/src/launcher';
import * as compactHttpRo from '../../../compact-http-ro/src/launcher';
import * as compactRo from '../../../compact-ro/src/launcher';
import * as compactSse from '../../../compact-sse/src/launcher';
import * as compactSseRo from '../../../compact-sse-ro/src/launcher';
import * as coreRo from '../../../core-ro/src/launcher';
import { HTTP_VERSION } from '../../../http/src/httpVersion';
import { main as httpMain } from '../../../http/src/launcher';
import * as httpRo from '../../../http-ro/src/launcher';
import { CORE_VERSION } from '../../../server/src/coreVersion';
import { main as coreMain } from '../../../server/src/launcher';
import { main as sseMain } from '../../../sse/src/launcher';
import { SSE_VERSION } from '../../../sse/src/sseVersion';
import * as sseRo from '../../../sse-ro/src/launcher';
import { activeTools, resetProcessLatchForTests } from '../../lib/activeTools';
import {
  CREDENTIALS_REQUIRED_WORDS,
  DESTINATIONS_ONLY_STDIO_WORDS,
} from '../../lib/httpTransport';
import { fullToolSet, type ToolSet } from '../../lib/toolSet';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  isLogoff,
} from '../helpers/adtStandIn';

type TransportName = 'stdio' | 'http' | 'sse';
type SetName = 'full' | 'full-ro' | 'compact' | 'compact-ro';

/** The two families of sets: a `-ro` set reads as its write set does. */
const familyOf = (set: SetName): 'full' | 'compact' =>
  set.startsWith('full') ? 'full' : 'compact';

/** What a test gives `main` in place of the process. */
interface Edges {
  argv: readonly string[];
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
  processLike: EventEmitter & { stdin: EventEmitter };
  transport?: Transport;
}

interface Launcher {
  /** The binary's `main`, given the edges. */
  main: (edges: Edges) => Promise<unknown>;
  toolSet: ToolSet;
  program: string;
}

/**
 * The twelve launchers: the full ones as their bins call them, the
 * others through their own packages.
 */
const LAUNCHERS: Record<TransportName, Record<SetName, Launcher>> = {
  stdio: {
    full: {
      main: (edges) =>
        coreMain(
          {
            toolSet: fullToolSet,
            program: 'mcp-abap-adt',
            version: CORE_VERSION,
          },
          edges,
        ),
      toolSet: fullToolSet,
      program: 'mcp-abap-adt',
    },
    'full-ro': {
      main: (edges) => coreRo.main(edges),
      toolSet: coreRo.readOnlyToolSet,
      program: 'mcp-abap-adt-ro',
    },
    compact: {
      main: (edges) => compactStdio.main(edges),
      toolSet: compactStdio.compactToolSet,
      program: 'mcp-abap-adt-compact',
    },
    'compact-ro': {
      main: (edges) => compactRo.main(edges),
      toolSet: compactRo.readOnlyToolSet,
      program: 'mcp-abap-adt-compact-ro',
    },
  },
  http: {
    full: {
      main: (edges) =>
        httpMain(
          {
            toolSet: fullToolSet,
            program: 'mcp-abap-adt-http',
            version: HTTP_VERSION,
          },
          edges,
        ),
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-http',
    },
    'full-ro': {
      main: (edges) => httpRo.main(edges),
      toolSet: httpRo.readOnlyToolSet,
      program: 'mcp-abap-adt-http-ro',
    },
    compact: {
      main: (edges) => compactHttp.main(edges),
      toolSet: compactHttp.compactToolSet,
      program: 'mcp-abap-adt-compact-http',
    },
    'compact-ro': {
      main: (edges) => compactHttpRo.main(edges),
      toolSet: compactHttpRo.readOnlyToolSet,
      program: 'mcp-abap-adt-compact-http-ro',
    },
  },
  sse: {
    full: {
      main: (edges) =>
        sseMain(
          {
            toolSet: fullToolSet,
            program: 'mcp-abap-adt-sse',
            version: SSE_VERSION,
          },
          edges,
        ),
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-sse',
    },
    'full-ro': {
      main: (edges) => sseRo.main(edges),
      toolSet: sseRo.readOnlyToolSet,
      program: 'mcp-abap-adt-sse-ro',
    },
    compact: {
      main: (edges) => compactSse.main(edges),
      toolSet: compactSse.compactToolSet,
      program: 'mcp-abap-adt-compact-sse',
    },
    'compact-ro': {
      main: (edges) => compactSseRo.main(edges),
      toolSet: compactSseRo.readOnlyToolSet,
      program: 'mcp-abap-adt-compact-sse-ro',
    },
  },
};

/**
 * A read about one class on each set: the tool that sends it differs,
 * nothing else. Where-used, because both sets' tools for it are listed long
 * tools and so behave alike — each on a connection of its own;
 * compact's class read (`HandlerGet`) is listed and full's (`GetClass`) is
 * not, so those two no longer share a failure path.
 */
const readCall = (
  set: SetName,
  className = 'ZCL_PARITY',
): { name: string; arguments: Record<string, unknown> } =>
  familyOf(set) === 'full'
    ? {
        name: 'GetWhereUsed',
        arguments: { object_name: className, object_type: 'class' },
      }
    : {
        name: 'HandlerWhereUsed',
        arguments: { object_type: 'CLASS', object_name: className },
      };
const READ_CALL: Record<SetName, ReturnType<typeof readCall>> = {
  full: readCall('full'),
  'full-ro': readCall('full-ro'),
  compact: readCall('compact'),
  'compact-ro': readCall('compact-ro'),
};

/** The `Authorization` headers of the stand-in's requests naming `className`. */
const presentedFor = (className: string) => [
  ...new Set(
    standIn.requests
      .filter((r) => r.url.includes(className.toLowerCase()))
      .map((r) => r.authorization),
  ),
];

/** The data of the next `event: <name>` of an SSE stream, read by plain string search. */
function eventReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return async (name: string): Promise<string> => {
    const marker = `event: ${name}\n`;
    for (;;) {
      const at = buffer.indexOf(marker);
      if (at >= 0) {
        const dataAt = buffer.indexOf('data: ', at + marker.length);
        const end = dataAt >= 0 ? buffer.indexOf('\n', dataAt) : -1;
        if (end >= 0) {
          const data = buffer.slice(dataAt + 'data: '.length, end).trim();
          buffer = buffer.slice(end + 1);
          return data;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buffer += decoder.decode(value, { stream: true }).split('\r').join('');
    }
  };
}

/** An option of another binary, refused by each transport's table. */
const OTHER_OPTION: Record<TransportName, string> = {
  stdio: '--sse-port=3001',
  http: '--mcp=TRIAL',
  sse: '--http-port=3001',
};

const savedEnv = { ...process.env };
/** What a case started and has not stopped: stopped after it, pass or fail. */
const open: { clients: Client[]; runs: Run[] } = { clients: [], runs: [] };
let workdir: string;
let standIn: AdtStandIn;

beforeEach(async () => {
  workdir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tool-set-parity-')),
  );
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('MCP_') ||
      key.startsWith('SAP_') ||
      key === 'AUTH_BROKER_PATH'
    ) {
      delete process.env[key];
    }
  }
  // The stores of a named destination, if any were asked for, stay here.
  process.env.AUTH_BROKER_PATH = workdir;
  standIn = await adtStandIn();
  // The servers' own lines (the template notice, the state's lines) are not
  // the subject here; what a test observes comes through the edges.
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  for (const client of open.clients.splice(0)) {
    await client.close().catch(() => undefined);
  }
  for (const started of open.runs.splice(0)) {
    if (started.exits.length === 0) await started.stop();
  }
  // An SSE connection logs its close once its socket is gone; let it, while
  // the console is still silenced.
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  jest.restoreAllMocks();
  await standIn.close();
  process.env = { ...savedEnv };
  fs.rmSync(workdir, { recursive: true, force: true });
});

/** A started launcher: what it wrote, how it exited, and how to stop it. */
interface Run {
  stdout: string[];
  stderr: string[];
  exits: number[];
  processLike: Edges['processLike'];
  /** Ends a running server as a signal would, and waits for its exit. */
  stop(): Promise<number>;
  /** Resolves with the first exit code, however the shutdown was started. */
  exited: Promise<number>;
}

async function run(
  launcher: Launcher,
  argv: string[],
  transport?: Transport,
): Promise<Run> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  let exited: (code: number) => void = () => {};
  const exit = new Promise<number>((resolve) => {
    exited = resolve;
  });
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  // One process, one shutdown: an earlier launcher's shutdown in this test
  // process latched the registry; a new launcher is a new program.
  resetProcessLatchForTests();
  await launcher.main({
    argv,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    exit: (code) => {
      exits.push(code);
      exited(code);
    },
    processLike,
    ...(transport !== undefined && { transport }),
  });
  const started: Run = {
    stdout,
    stderr,
    exits,
    processLike,
    stop: async () => {
      processLike.emit('SIGTERM');
      return exit;
    },
    exited: exit,
  };
  open.runs.push(started);
  return started;
}

/** A port no one listens on now. */
async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/**
 * The help, with what is the binary's own — its name and its TOOLS section —
 * set aside.
 */
async function helpOf(
  launcher: Launcher,
  transportName: TransportName,
): Promise<string> {
  const { stderr, exits } = await run(launcher, ['--help']);
  expect(exits).toEqual([0]);
  return stderr
    .join('\n')
    .split(launcher.toolSet.toolsHelp(transportName))
    .join('<tools section>')
    .split(`USAGE:\n  ${launcher.program} [options]`)
    .join('USAGE:\n  <program> [options]')
    .split(`\n  ${launcher.program} `)
    .join('\n  <program> ');
}

/** The `--conf` template's keys and values: the same for every set (no exposition). */
async function templateOf(
  launcher: Launcher,
): Promise<{ exits: number[]; values: Record<string, unknown> }> {
  const file = path.join(workdir, `${launcher.program}.yaml`);
  const { exits } = await run(launcher, [`--conf=${file}`]);
  const values = load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.rmSync(file);
  expect(values.exposition).toBeUndefined();
  return { exits, values };
}

/** A start that is expected to stop: its words and exit. */
async function refusalOf(launcher: Launcher, argv: string[]) {
  const { stderr, exits } = await run(launcher, argv);
  return { stderr, exits };
}

/** A tool call's outcome, as the client reads it: ok, or the failure's fields. */
function outcomeOf(result: unknown): Record<string, unknown> {
  const { isError, content } = result as {
    isError?: boolean;
    content: { text: string }[];
  };
  if (!isError) return { ok: true };
  const text = content[0].text;
  // A tool failure is JSON; anything else is kept as it is, to be seen.
  if (!text.startsWith('{')) return { ok: false, text };
  return { ok: false, ...(JSON.parse(text) as Record<string, unknown>) };
}

/**
 * The `Authorization` headers the stand-in received since `from`. A logoff
 * presents the session, not the credential: compact's `HandlerGet` is a
 * listed long tool whose own connection is logged off after its
 * answer, and the full set's `GetClass` is not.
 */
const seenSince = (from: number) => [
  ...new Set(
    standIn.requests
      .slice(from)
      .filter((r) => !isLogoff(r.url))
      .map((r) => r.authorization),
  ),
];

/** The runtime session files of the launcher's process (`AUTH_BROKER_PATH`). */
const runtimeDir = () => path.join(workdir, 'runtime');

/**
 * What the runtime folder holds: absent when nothing was ever written (the
 * owner makes the folder with its first file and leaves it), else its files.
 */
const runtimeState = (): 'absent' | string[] =>
  fs.existsSync(runtimeDir()) ? fs.readdirSync(runtimeDir()) : 'absent';

/**
 * One call with the stand-in answering, then one with it refusing the
 * credential; `between` runs after the first answer, while its connection is
 * held.
 */
async function callTwice(
  client: Client,
  set: SetName,
  between: () => void = () => {},
) {
  const from = standIn.requests.length;
  const answered = outcomeOf(await client.callTool(READ_CALL[set]));
  const presented = seenSince(from);
  between();
  standIn.refuse(true);
  try {
    const refused = outcomeOf(await client.callTool(READ_CALL[set]));
    return { answered, presented, refused };
  } finally {
    standIn.refuse(false);
  }
}

const names = async (client: Client) =>
  (await client.listTools()).tools.map((tool) => tool.name).sort();

/** stdio: the destination's user; with no destination, inspection-only. */
async function serveStdio(launcher: Launcher, set: SetName) {
  const envFile = path.join(workdir, 'parity.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${standIn.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=PARITY_USER',
      'SAP_PASSWORD=parity-password',
      '',
    ].join('\n'),
  );
  const connect = async (argv: string[]) => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'parity', version: '1.0.0' });
    open.clients.push(client);
    const started = await run(launcher, argv, serverSide);
    await client.connect(clientSide);
    return { client, started };
  };

  const destination = await connect([
    `--env-path=${envFile}`,
    '--system-type=onprem',
  ]);
  const tools = await names(destination.client);
  // stdio keeps its runtime files: the destination's connection holds its
  // session, so its file is there after the first answer.
  let runtimeFiles: 'absent' | number = 'absent';
  const calls = await callTwice(destination.client, set, () => {
    const state = runtimeState();
    runtimeFiles = state === 'absent' ? state : state.length;
  });
  await destination.client.close();
  const destinationExit = await destination.started.stop();

  const inspection = await connect(['--system-type=onprem']);
  const inspectionOnly = outcomeOf(
    await inspection.client.callTool(READ_CALL[set]),
  );
  await inspection.client.close();
  const inspectionExit = await inspection.started.stop();

  return {
    tools,
    observed: {
      credential: calls.presented,
      runtimeFiles,
      answered: calls.answered,
      refused: calls.refused,
      destinationExit,
      inspectionOnly,
      inspectionExit,
    },
  };
}

const userHeaders = (user: string, password: string) => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': user,
  'x-sap-password': password,
});
const basicHeaders = () => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': 'PARITY_USER',
  'x-sap-password': 'parity-password',
});
const tokenHeaders = () => ({
  'x-sap-url': standIn.url,
  'x-sap-jwt-token': 'parity-token.payload.sig',
});

/** Streamable HTTP and SSE: credentials only from the headers. */
async function serveHttpLike(
  transportName: 'http' | 'sse',
  launcher: Launcher,
  set: SetName,
) {
  // Each start listens on a port of its own: a client's pooled connection to
  // a stopped server must not meet the next one.
  const at = (port: number) => ({
    listen:
      transportName === 'http'
        ? ['--host=127.0.0.1', `--port=${port}`]
        : ['--sse-host=127.0.0.1', `--sse-port=${port}`],
    endpoint:
      transportName === 'http'
        ? `http://127.0.0.1:${port}/mcp/stream/http`
        : `http://127.0.0.1:${port}/sse`,
  });
  const { listen, endpoint } = at(await freePort());

  const clientWith = async (
    headers: Record<string, string>,
    url = endpoint,
  ) => {
    const client = new Client({ name: 'parity', version: '1.0.0' });
    open.clients.push(client);
    const transport =
      transportName === 'http'
        ? new StreamableHTTPClientTransport(new URL(url), {
            requestInit: { headers },
          })
        : new SSEClientTransport(new URL(url), {
            requestInit: { headers },
          });
    await client.connect(transport);
    return client;
  };

  /** What a request without credentials, or naming a destination, is answered. */
  const refusedRequest = async (headers: Record<string, string>) => {
    const response =
      transportName === 'http'
        ? await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              ...headers,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'parity', version: '1.0.0' },
              },
            }),
          })
        : await fetch(endpoint, { headers });
    return { status: response.status, body: await response.text() };
  };

  const started = await run(launcher, [...listen, '--system-type=onprem']);
  const basicClient = await clientWith(basicHeaders());
  const tools = await names(basicClient);
  // http and sse write no runtime file: not while a request's
  // connection is held, not after.
  const runtime: Array<'absent' | string[]> = [];
  const basic = await callTwice(basicClient, set, () =>
    runtime.push(runtimeState()),
  );
  await basicClient.close();
  const tokenClient = await clientWith(tokenHeaders());
  const token = await callTwice(tokenClient, set);
  await tokenClient.close();
  const noCredentials = await refusedRequest({});
  const destinationHeader = await refusedRequest({
    ...basicHeaders(),
    'x-mcp-destination': 'TRIAL',
  });

  // Two clients at once, each with its own user: neither sees the other's.
  const [clientA, clientB] = await Promise.all([
    clientWith(userHeaders('USER_A', 'pass-a')),
    clientWith(userHeaders('USER_B', 'pass-b')),
  ]);
  await Promise.all([
    clientA.callTool(readCall(set, 'ZCL_PARITY_A')),
    clientB.callTool(readCall(set, 'ZCL_PARITY_B')),
  ]);
  const concurrent = {
    a: presentedFor('ZCL_PARITY_A'),
    b: presentedFor('ZCL_PARITY_B'),
  };
  await Promise.all([clientA.close(), clientB.close()]);

  // SSE: a POST is routed by its sessionId alone.
  const sseOnly =
    transportName === 'sse' ? await ssePosts(endpoint, set) : undefined;
  const exit = await started.stop();
  runtime.push(runtimeState());

  return {
    tools,
    observed: {
      runtime,
      basic,
      token,
      noCredentials,
      destinationHeader,
      concurrent,
      sseOnly,
      exit,
    },
  };
}

/**
 * SSE: a connection opened by user A; a POST carrying user B's `x-sap-*`
 * headers still runs as A, and a POST carrying `x-mcp-destination` is
 * answered `400`.
 */
async function ssePosts(endpoint: string, set: SetName) {
  const controller = new AbortController();
  try {
    const response = await fetch(endpoint, {
      headers: userHeaders('USER_A', 'pass-a'),
      signal: controller.signal,
    });
    const next = eventReader(response.body as ReadableStream<Uint8Array>);
    const postUrl = new URL(await next('endpoint'), endpoint);
    const post = (headers: Record<string, string>, body: object) =>
      fetch(postUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, ...body }),
      });
    const call = readCall(set, 'ZCL_PARITY_POST');
    const accepted = await post(userHeaders('USER_B', 'pass-b'), {
      method: 'tools/call',
      params: call,
    });
    await next('message');
    const destination = await post(
      { ...userHeaders('USER_A', 'pass-a'), 'x-mcp-destination': 'TRIAL' },
      { method: 'tools/call', params: call },
    );
    return {
      postStatus: accepted.status,
      postPresented: presentedFor('ZCL_PARITY_POST'),
      destinationPost: {
        status: destination.status,
        body: await destination.text(),
      },
    };
  } finally {
    controller.abort();
  }
}

async function observe(transportName: TransportName, set: SetName) {
  const launcher = LAUNCHERS[transportName][set];
  const served =
    transportName === 'stdio'
      ? await serveStdio(launcher, set)
      : await serveHttpLike(transportName, launcher, set);
  return {
    tools: served.tools,
    observed: {
      help: await helpOf(launcher, transportName),
      template: await templateOf(launcher),
      transportGone: await refusalOf(launcher, ['--transport=stdio']),
      otherBinary: await refusalOf(launcher, [OTHER_OPTION[transportName]]),
      served: served.observed,
    },
  };
}

/**
 * A `401` inside a handler is a failure on either set; which answer it gets
 * (the failure answer's `authentication_failed`) is pinned elsewhere, so only its being a failure is
 * pinned here — full and compact are compared whole above.
 */
const USER_REFUSED = { ok: false };

const COMPACT_RW = [
  'HandlerActivate',
  'HandlerCreate',
  'HandlerDelete',
  'HandlerGet',
  'HandlerLock',
  'HandlerTransportCreate',
  'HandlerTransportMoveObjects',
  'HandlerTransportSortAndCompress',
  'HandlerUnlock',
  'HandlerUpdate',
];
const COMPACT_DEBUG = [
  'HandlerDebugStart',
  'HandlerDebugStep',
  'HandlerDebugView',
  'HandlerDebugWait',
];

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: the four binaries differ only in their tools',
  (transportName) => {
    jest.setTimeout(240_000);

    it('observes the same behaviour through the four launchers', async () => {
      const full = await observe(transportName, 'full');
      const fullRo = await observe(transportName, 'full-ro');
      const compact = await observe(transportName, 'compact');
      const compactRo = await observe(transportName, 'compact-ro');

      // Everything but the tools is the transport's, the same for every set.
      expect(fullRo.observed).toEqual(full.observed);
      expect(compact.observed).toEqual(full.observed);
      expect(compactRo.observed).toEqual(full.observed);

      // What was observed is the transport's behaviour, not two empty answers.
      const served = full.observed.served as Record<string, unknown>;
      if (transportName === 'stdio') {
        expect(served.credential).toEqual([
          basicOf('PARITY_USER', 'parity-password'),
        ]);
        expect(served.answered).toEqual({ ok: true });
        expect(served.runtimeFiles).toBe(1);
        expect(served.refused).toMatchObject(USER_REFUSED);
        expect(served.inspectionOnly).toMatchObject({
          ok: false,
          error: 'inspection_only',
        });
      } else {
        const basic = served.basic as Record<string, unknown>;
        const token = served.token as Record<string, unknown>;
        expect(served.runtime).toEqual(['absent', 'absent']);
        expect(basic.presented).toEqual([
          basicOf('PARITY_USER', 'parity-password'),
        ]);
        expect(token.presented).toEqual(['Bearer parity-token.payload.sig']);
        expect(basic.answered).toEqual({ ok: true });
        expect(basic.refused).toMatchObject(USER_REFUSED);
        expect(token.answered).toEqual({ ok: true });
        expect(token.refused).toMatchObject({ ok: false });
        expect(served.noCredentials).toEqual({
          status: 400,
          body: expect.stringContaining(CREDENTIALS_REQUIRED_WORDS),
        });
        expect(served.destinationHeader).toEqual({
          status: 400,
          body: expect.stringContaining(DESTINATIONS_ONLY_STDIO_WORDS),
        });
        expect(served.concurrent).toEqual({
          a: [basicOf('USER_A', 'pass-a')],
          b: [basicOf('USER_B', 'pass-b')],
        });
        if (transportName === 'sse') {
          expect(served.sseOnly).toEqual({
            postStatus: 202,
            postPresented: [basicOf('USER_A', 'pass-a')],
            destinationPost: {
              status: 400,
              body: expect.stringContaining(DESTINATIONS_ONLY_STDIO_WORDS),
            },
          });
        }
      }
      expect(full.observed.transportGone.exits).toEqual([1]);
      expect(full.observed.transportGone.stderr.join('\n')).toContain(
        '`--transport` is gone',
      );
      expect(full.observed.otherBinary.exits).toEqual([1]);
      expect(full.observed.template.exits).toEqual([0]);

      // The tools: the object-oriented surface, and the compact facade —
      // each binary's list is fixed by the binary.
      expect(full.tools).toContain('GetClass');
      expect(full.tools).not.toContain('HandlerGet');
      expect(compact.tools).not.toContain('GetClass');
      // The leftover-session tools are stdio's: every one on
      // a write binary and the list and logoff on a -ro one there; none on
      // any http or sse binary, compact ones included.
      const onStdio = transportName === 'stdio';
      const leftover = (tools: string[]) =>
        tools.filter((n) => n.includes('LeftoverSession'));
      expect({
        full: leftover(full.tools),
        fullRo: leftover(fullRo.tools),
        compact: leftover(compact.tools),
        compactRo: leftover(compactRo.tools),
      }).toEqual(
        onStdio
          ? {
              full: ['ListLeftoverSessions', 'LogoffLeftoverSession'],
              fullRo: ['ListLeftoverSessions', 'LogoffLeftoverSession'],
              compact: [
                'HandlerLeftoverSessionList',
                'HandlerLeftoverSessionLogoff',
              ],
              compactRo: [
                'HandlerLeftoverSessionList',
                'HandlerLeftoverSessionLogoff',
              ],
            }
          : { full: [], fullRo: [], compact: [], compactRo: [] },
      );
      // core: the debugger, high, background runs and the three batch
      // tools, always.
      expect(full.tools).toHaveLength(onStdio ? 254 : 252);
      expect(full.tools).toEqual(
        expect.arrayContaining([
          'DebugStartListener',
          'DebugStop',
          'CreateClass',
          'GetBackgroundRun',
          'BatchBegin',
          'BatchEnd',
          'BatchAnswers',
        ]),
      );
      // core-ro: the readonly tools with system and search, the three batch
      // tools (and, on stdio, the list and the logoff); no write, debugger,
      // background run or resume.
      expect(fullRo.tools).toHaveLength(onStdio ? 71 : 69);
      expect(fullRo.tools).toEqual(
        expect.arrayContaining([
          'GetClass',
          'GetWhereUsed',
          'SearchObject',
          'BatchBegin',
          'BatchEnd',
          'BatchAnswers',
        ]),
      );
      for (const name of [
        'CreateClass',
        'DebugStartListener',
        'GetBackgroundRun',
        'ResumeLeftoverSession',
      ]) {
        expect({ name, served: fullRo.tools.includes(name) }).toEqual({
          name,
          served: false,
        });
      }
      // compact: the 29, the four debugger verbs, the three background-run
      // tools beside the run tool, HandlerBatch, and on stdio the
      // leftover-session list and logoff (no set serves a resume).
      expect(compact.tools).toHaveLength(29 + 4 + 3 + 1 + (onStdio ? 2 : 0));
      expect(compact.tools).toEqual(
        expect.arrayContaining([
          ...COMPACT_RW,
          ...COMPACT_DEBUG,
          'HandlerBatch',
        ]),
      );
      // compact-ro: the 17 that change nothing, HandlerBatch, and on stdio
      // the list and the logoff.
      expect(compactRo.tools).toHaveLength(17 + 1 + (onStdio ? 2 : 0));
      expect(compactRo.tools).toContain('HandlerGet');
      expect(compactRo.tools).toContain('HandlerDeletionCheck');
      expect(compactRo.tools).toContain('HandlerBatch');
      for (const tools of [full.tools, fullRo.tools]) {
        expect(tools).not.toContain('HandlerBatch');
      }
      for (const tools of [compact.tools, compactRo.tools]) {
        expect(tools.filter((n) => n.startsWith('Batch'))).toEqual([]);
      }
      for (const name of [
        ...COMPACT_RW.filter((n) => n !== 'HandlerGet'),
        ...COMPACT_DEBUG,
        'HandlerBackgroundRunGet',
        'HandlerLeftoverSessionResume',
      ]) {
        expect({ name, served: compactRo.tools.includes(name) }).toEqual({
          name,
          served: false,
        });
      }
    });
  },
);

const SETS: readonly SetName[] = ['full', 'full-ro', 'compact', 'compact-ro'];

/** Each transport's binaries, by set, as the help and the refusals name them. */
const BINARIES_OF: Record<
  TransportName,
  Record<SetName, { bin: string; pkg: string }>
> = {
  stdio: {
    full: { bin: 'mcp-abap-adt', pkg: '@mcp-abap-adt/core' },
    'full-ro': { bin: 'mcp-abap-adt-ro', pkg: '@mcp-abap-adt/core-ro' },
    compact: { bin: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-ro',
      pkg: '@mcp-abap-adt/compact-ro',
    },
  },
  http: {
    full: { bin: 'mcp-abap-adt-http', pkg: '@mcp-abap-adt/http' },
    'full-ro': { bin: 'mcp-abap-adt-http-ro', pkg: '@mcp-abap-adt/http-ro' },
    compact: {
      bin: 'mcp-abap-adt-compact-http',
      pkg: '@mcp-abap-adt/compact-http',
    },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-http-ro',
      pkg: '@mcp-abap-adt/compact-http-ro',
    },
  },
  sse: {
    full: { bin: 'mcp-abap-adt-sse', pkg: '@mcp-abap-adt/sse' },
    'full-ro': { bin: 'mcp-abap-adt-sse-ro', pkg: '@mcp-abap-adt/sse-ro' },
    compact: {
      bin: 'mcp-abap-adt-compact-sse',
      pkg: '@mcp-abap-adt/compact-sse',
    },
    'compact-ro': {
      bin: 'mcp-abap-adt-compact-sse-ro',
      pkg: '@mcp-abap-adt/compact-sse-ro',
    },
  },
};

const GONE = 'is gone (19.0.0): the binary fixes its tool set, so remove it';

/**
 * The binary fixes the tool set: `--exposition` and the config file's
 * `exposition` stop each of the twelve binaries with the sentence of the
 * word, naming the binary of its own transport — through the binary, not
 * only the table.
 */
describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: --exposition and the config file’s exposition stop every binary',
  (transportName) => {
    jest.setTimeout(60_000);
    const b = BINARIES_OF[transportName];
    const named = (set: SetName) => `\`${b[set].bin}\` (\`${b[set].pkg}\`)`;

    const conf = (exposition: string) => {
      const file = path.join(workdir, 'exposition.yaml');
      fs.writeFileSync(file, `exposition: ${exposition}\n`);
      return `--conf=${file}`;
    };

    it.each(SETS)('%s', async (set) => {
      const launcher = LAUNCHERS[transportName][set];
      expect(await refusalOf(launcher, ['--exposition=readonly'])).toEqual({
        stderr: [
          `[MCP] --exposition ${GONE}; the readonly tools alone (with system and search) are served by ${named('full-ro')}`,
        ],
        exits: [1],
      });
      expect(await refusalOf(launcher, ['--exposition', 'ro,debug'])).toEqual({
        stderr: [
          familyOf(set) === 'full'
            ? `[MCP] --exposition ${GONE}; the debugger is always served by ${named('full')}, and by no -ro binary`
            : `[MCP] --exposition ${GONE}; the compact debugger is always served by ${named('compact')}, and by no -ro binary`,
        ],
        exits: [1],
      });
      expect(await refusalOf(launcher, ['--exposition=rw'])).toEqual({
        stderr: [
          `[MCP] --exposition ${GONE}; all compact tools are served by ${named('compact')}`,
        ],
        exits: [1],
      });
      // The config file: refused before anything starts, naming the file.
      const fromFile = await refusalOf(launcher, [conf('readonly,high')]);
      expect(fromFile.exits).toEqual([1]);
      expect(fromFile.stderr.join('\n')).toContain(
        'exposition.yaml is refused',
      );
      expect(fromFile.stderr.join('\n')).toContain(
        `exposition (config file) ${GONE}; the high tools are served, beside the readonly ones, by ${named('full')}`,
      );
    });
  },
);

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: each binary’s help names its own tools and the other binaries of its transport',
  (transportName) => {
    const b = BINARIES_OF[transportName];

    it.each(SETS)('%s', async (set) => {
      const launcher = LAUNCHERS[transportName][set];
      expect(launcher.program).toBe(b[set].bin);
      const help = (await run(launcher, ['--help'])).stderr.join('\n');
      expect(help).toContain(
        `\nTOOLS:\n  ${b[set].bin} serves one fixed tool set`,
      );
      expect(help).not.toContain('--exposition=');
      // The write binary names its -ro one, and the -ro one its write one.
      const pair: SetName =
        set === 'full'
          ? 'full-ro'
          : set === 'full-ro'
            ? 'full'
            : set === 'compact'
              ? 'compact-ro'
              : 'compact';
      expect(help).toContain(`npm i -g ${b[pair].pkg}, then ${b[pair].bin}\n`);
      for (const other of ['stdio', 'http', 'sse'] as const) {
        if (other === transportName) continue;
        for (const binary of Object.values(BINARIES_OF[other])) {
          expect(help).not.toContain(`npm i -g ${binary.pkg},`);
        }
      }
    });
  },
);

/**
 * A `-ro` binary keeps no background run (the owner's decision): its run
 * tools (`RuntimeRunClass` is a system tool; running code changes no code)
 * offer no `background` — not in the schema a client lists, and not read:
 * a call carrying it anyway runs as any run, never refused. The write
 * binary's run tool offers it and starts a run. On each transport, through
 * the binary.
 */
describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: a -ro binary serves no background run',
  (transportName) => {
    jest.setTimeout(60_000);

    /** One `RuntimeRunClass` call with `background: true` through `set`'s binary. */
    const backgroundCall = async (set: SetName) => {
      const launcher = LAUNCHERS[transportName][set];
      const client = new Client({ name: 'parity', version: '1.0.0' });
      open.clients.push(client);
      let started: Run;
      if (transportName === 'stdio') {
        const envFile = path.join(workdir, 'background.env');
        fs.writeFileSync(
          envFile,
          [
            `SAP_URL=${standIn.url}`,
            'SAP_CLIENT=100',
            'SAP_AUTH_TYPE=basic',
            'SAP_USERNAME=PARITY_USER',
            'SAP_PASSWORD=parity-password',
            '',
          ].join('\n'),
        );
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        started = await run(
          launcher,
          [`--env-path=${envFile}`, '--system-type=onprem'],
          serverSide,
        );
        await client.connect(clientSide);
      } else {
        const port = await freePort();
        started = await run(launcher, [
          ...(transportName === 'http'
            ? ['--host=127.0.0.1', `--port=${port}`]
            : ['--sse-host=127.0.0.1', `--sse-port=${port}`]),
          '--system-type=onprem',
        ]);
        const url =
          transportName === 'http'
            ? `http://127.0.0.1:${port}/mcp/stream/http`
            : `http://127.0.0.1:${port}/sse`;
        const headers = basicHeaders();
        await client.connect(
          transportName === 'http'
            ? new StreamableHTTPClientTransport(new URL(url), {
                requestInit: { headers },
              })
            : new SSEClientTransport(new URL(url), {
                requestInit: { headers },
              }),
        );
      }
      const listed = (await client.listTools()).tools.find(
        (tool) => tool.name === 'RuntimeRunClass',
      );
      const offered = Object.hasOwn(
        (listed?.inputSchema.properties ?? {}) as object,
        'background',
      );
      const from = standIn.requests.length;
      const result = await client.callTool({
        name: 'RuntimeRunClass',
        arguments: { class_name: 'ZCL_PARITY_RUN', background: true },
      });
      const text = JSON.stringify(result.content);
      const answer = outcomeOf(result);
      const reached = standIn.requests.length - from;
      await client.close();
      await started.stop();
      return {
        listed: listed !== undefined,
        offered,
        answer,
        reached,
        runHandle: text.includes('run_handle'),
        unavailable: text.includes('background_runs_unavailable'),
      };
    };

    it('full-ro serves RuntimeRunClass without background, and never refuses it; full offers it and starts a run', async () => {
      const ro = await backgroundCall('full-ro');
      expect({
        listed: ro.listed,
        offered: ro.offered,
        unavailable: ro.unavailable,
        runHandle: ro.runHandle,
      }).toEqual({
        listed: true,
        offered: false,
        unavailable: false,
        runHandle: false,
      });
      // It ran as any run: the call reached the system.
      expect(ro.reached).toBeGreaterThan(0);
      const full = await backgroundCall('full');
      expect({
        listed: full.listed,
        offered: full.offered,
        runHandle: full.runHandle,
      }).toEqual({ listed: true, offered: true, runHandle: true });
    });
  },
);

/** Turns of the event loop on short real waits until `done()` holds. */
async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/**
 * One read on a cloud system, its system lookup held at the stand-in, and
 * while it is held: over SSE an MCP cancel — which aborts nothing, a tool
 * call cannot be cancelled; over Streamable HTTP, whose requests are each
 * their own, the client closing its request — which ends no call. Then the
 * lookup answered: whether the read reached the stand-in, and how the
 * server exited.
 */
async function cancelledRead(
  transportName: Exclude<TransportName, 'stdio'>,
  set: SetName,
) {
  const launcher = LAUNCHERS[transportName][set];
  const className = 'ZCL_PARITY_CANCEL';
  const call = readCall(set, className);
  const hold = standIn.hold((r) => r.url.includes('systeminformation'));
  const controller = new AbortController();
  let started: Run;
  let client: Client | undefined;
  let done: Promise<unknown>;

  if (transportName === 'sse') {
    const port = await freePort();
    started = await run(launcher, [
      '--sse-host=127.0.0.1',
      `--sse-port=${port}`,
      '--system-type=cloud',
    ]);
    client = new Client({ name: 'parity', version: '1.0.0' });
    open.clients.push(client);
    await client.connect(
      new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`), {
        requestInit: { headers: basicHeaders() },
      }),
    );
    done = client
      .callTool(call, undefined, { signal: controller.signal })
      .catch(() => 'cancelled');
  } else {
    const port = await freePort();
    started = await run(launcher, [
      '--host=127.0.0.1',
      `--port=${port}`,
      '--system-type=cloud',
    ]);
    done = fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...basicHeaders(),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: call,
      }),
      signal: controller.signal,
    })
      .then((response) => response.text())
      .catch(() => 'cancelled');
  }

  await hold.arrived;
  controller.abort();
  // A cancel (sse) or a dropped request (http) aborts nothing: the call is
  // live, its signal not aborted.
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(activeTools().length).toBeGreaterThan(0);
  expect(activeTools().every((tool) => !tool.signal.aborted)).toBe(true);
  hold.release();
  await until(() => activeTools().length === 0);
  await done;
  const reached = standIn.requests.some((r) =>
    r.url.includes(className.toLowerCase()),
  );
  await client?.close();
  const exit = await started.stop();
  return { reached, exit };
}

/**
 * http and sse: the window is the connection's system lookup, held. Over
 * Streamable HTTP the client closing its request ends no call, and over SSE
 * an MCP cancel aborts nothing: the tool runs once the lookup is answered (a stdio
 * process has its system information from its start; a queued call that
 * is sent a cancel keeps its place: `stateful/noCallCancel.test.ts`).
 */
describe.each<Exclude<TransportName, 'stdio'>>(['http', 'sse'])(
  '%s: a call during its system lookup, then a cancel or a dropped request, on both sets',
  (transportName) => {
    jest.setTimeout(60_000);

    it(
      transportName === 'http'
        ? 'the request closed ends no call: the read reaches the system'
        : 'an MCP cancel aborts nothing: the read reaches the system',
      async () => {
        const full = await cancelledRead(transportName, 'full');
        const compact = await cancelledRead(transportName, 'compact');
        expect(full).toEqual({ reached: true, exit: 0 });
        expect(compact).toEqual(full);
      },
    );
  },
);

/**
 * http and sse on ABAP Cloud: the first call that reaches the system asks
 * for its system information before its tool runs. A refused lookup is that
 * call's answer, its tool never run; the next call is not barred — it asks
 * again, and its tool runs once.
 */
describe.each<Exclude<TransportName, 'stdio'>>(['http', 'sse'])(
  '%s: a refused system lookup is the call’s answer, and the next call asks again',
  (transportName) => {
    jest.setTimeout(60_000);

    it.each<SetName>(['full', 'compact'])('%s', async (set) => {
      const launcher = LAUNCHERS[transportName][set];
      const port = await freePort();
      const started = await run(launcher, [
        ...(transportName === 'http'
          ? ['--host=127.0.0.1', `--port=${port}`]
          : ['--sse-host=127.0.0.1', `--sse-port=${port}`]),
        '--system-type=cloud',
      ]);
      const url =
        transportName === 'http'
          ? `http://127.0.0.1:${port}/mcp/stream/http`
          : `http://127.0.0.1:${port}/sse`;
      const client = new Client({ name: 'parity', version: '1.0.0' });
      open.clients.push(client);
      await client.connect(
        transportName === 'http'
          ? new StreamableHTTPClientTransport(new URL(url), {
              requestInit: { headers: basicHeaders() },
            })
          : new SSEClientTransport(new URL(url), {
              requestInit: { headers: basicHeaders() },
            }),
      );
      const isLookup = (r: { url: string }) =>
        r.url.includes('systeminformation');
      const reads = (className: string) =>
        standIn.requests.filter(
          (r) => !isLogoff(r.url) && r.url.includes(className.toLowerCase()),
        ).length;
      const lookups = () => standIn.requests.filter(isLookup).length;
      const from = lookups();
      standIn.answerOnce(isLookup, 500);
      try {
        const refused = outcomeOf(
          await client.callTool(readCall(set, 'ZCL_PARITY_LOOKUP_ONE')),
        );
        expect(refused).toMatchObject({
          ok: false,
          error: 'system_lookup_failed',
        });
        expect(reads('ZCL_PARITY_LOOKUP_ONE')).toBe(0);
        const answered = outcomeOf(
          await client.callTool(readCall(set, 'ZCL_PARITY_LOOKUP_TWO')),
        );
        expect(answered).toEqual({ ok: true });
        expect(lookups() - from).toBe(2);
        expect(reads('ZCL_PARITY_LOOKUP_TWO')).toBe(1);
      } finally {
        await client.close();
        expect(await started.stop()).toBe(0);
      }
    });
  },
);

/**
 * A write of one class on each set: the full set's lock, update, unlock; the
 * compact one write under a lock handle.
 */
const writeCall = (
  set: SetName,
  className: string,
): { name: string; arguments: Record<string, unknown> } => {
  const source_code = `CLASS ${className} DEFINITION. ENDCLASS. CLASS ${className} IMPLEMENTATION. ENDCLASS.`;
  return set === 'full'
    ? { name: 'UpdateClass', arguments: { class_name: className, source_code } }
    : {
        name: 'HandlerUpdate',
        arguments: {
          object_type: 'CLASS',
          class_name: className,
          source_code,
          lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
        },
      };
};

/** A `tools/call` written in two halves on a raw socket: accepted before `finish()`. */
function halfPost(
  port: number,
  pathAndQuery: string,
  headers: Record<string, string>,
  body: object,
) {
  const text = JSON.stringify(body);
  const half = Math.floor(text.length / 2);
  const socket = net.connect(port, '127.0.0.1');
  socket.on('error', () => undefined);
  let received = '';
  socket.on('data', (chunk) => {
    received += chunk.toString('utf8');
  });
  const ended = new Promise<void>((r) => socket.on('close', () => r()));
  const head = [
    `POST ${pathAndQuery} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    'Content-Type: application/json',
    'Accept: application/json, text/event-stream',
    `Content-Length: ${Buffer.byteLength(text)}`,
    'Connection: close',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ].join('\r\n');
  const sent = new Promise<void>((resolve) =>
    socket.on('connect', () =>
      socket.write(`${head}\r\n\r\n${text.slice(0, half)}`, () => resolve()),
    ),
  );
  return {
    sent,
    finish: async () => {
      socket.write(text.slice(half));
      await ended;
      return Number(received.split(' ')[1]);
    },
  };
}

/** What a refused call answered: the fields that tell the shutdown refusal. */
const shutdownRefusalOf = (outcome: Record<string, unknown>) => ({
  ok: outcome.ok,
  kind: outcome.kind,
  server: outcome.server,
});

/**
 * A write whose update is held at the stand-in when the shutdown starts
 * (stdio: stdin's end; http and sse: `SIGTERM`), and a call accepted before
 * the latch whose body — or, over stdio, whose message — arrives after it.
 */
async function shutdownCase(transportName: TransportName, set: SetName) {
  const launcher = LAUNCHERS[transportName][set];
  const className = 'ZCL_PARITY_DOWN';
  const lateClass = 'ZCL_PARITY_LATE';
  const isUpdate = (r: { method: string; url: string }) =>
    r.method === 'PUT' && r.url.includes(className.toLowerCase());
  const hold = standIn.hold(isUpdate);
  const logoffsBefore = standIn.requests.filter((r) => isLogoff(r.url)).length;
  let started: Run;
  // The late call: sent after the trigger, its answer not read (the
  // transport closes with the process); only whether it reached the system.
  let late: () => Promise<unknown>;
  let done = () => {};

  if (transportName === 'stdio') {
    const envFile = path.join(workdir, 'shutdown.env');
    fs.writeFileSync(
      envFile,
      [
        `SAP_URL=${standIn.url}`,
        'SAP_CLIENT=100',
        'SAP_AUTH_TYPE=basic',
        'SAP_USERNAME=PARITY_USER',
        'SAP_PASSWORD=parity-password',
        '',
      ].join('\n'),
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'parity', version: '1.0.0' });
    open.clients.push(client);
    started = await run(
      launcher,
      [`--env-path=${envFile}`, '--system-type=onprem'],
      serverSide,
    );
    await client.connect(clientSide);
    void client
      .callTool(writeCall(set, className), undefined, { timeout: 600_000 })
      .catch(() => undefined);
    await hold.arrived;
    started.processLike.stdin.emit('end');
    late = () =>
      client.callTool(writeCall(set, lateClass)).catch(() => undefined);
  } else if (transportName === 'http') {
    const port = await freePort();
    started = await run(launcher, [
      '--host=127.0.0.1',
      `--port=${port}`,
      '--system-type=onprem',
    ]);
    // Compact's write over HTTP runs under a lock the instance holds: the
    // lock first, its state_handle in the header of the write.
    let writeHeaders: Record<string, string> = basicHeaders();
    let write = writeCall(set, className);
    if (set === 'compact') {
      const locked = await fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...basicHeaders(),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'tools/call',
          params: {
            name: 'HandlerLock',
            arguments: { object_type: 'CLASS', object_name: className },
          },
        }),
      });
      const answer = JSON.parse(
        ((await locked.json()) as { result: { content: { text: string }[] } })
          .result.content[0]?.text ?? '{}',
      ) as { lock_handle: string; state_handle: string };
      writeHeaders = {
        ...writeHeaders,
        'x-mcp-state-handle': answer.state_handle,
      };
      write = {
        name: write.name,
        arguments: { ...write.arguments, lock_handle: answer.lock_handle },
      };
    }
    void fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...writeHeaders,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: write,
      }),
    }).catch(() => undefined);
    await hold.arrived;
    const pending = halfPost(port, '/mcp/stream/http', basicHeaders(), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: writeCall(set, lateClass),
    });
    await pending.sent;
    await new Promise((r) => setTimeout(r, 100));
    started.processLike.emit('SIGTERM');
    late = () => pending.finish().catch(() => undefined);
  } else {
    const port = await freePort();
    started = await run(launcher, [
      '--sse-host=127.0.0.1',
      `--sse-port=${port}`,
      '--system-type=onprem',
    ]);
    const controller = new AbortController();
    done = () => controller.abort();
    const stream = await fetch(`http://127.0.0.1:${port}/sse`, {
      headers: basicHeaders(),
      signal: controller.signal,
    });
    const next = eventReader(stream.body as ReadableStream<Uint8Array>);
    const postPath = await next('endpoint');
    await fetch(new URL(postPath, `http://127.0.0.1:${port}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: writeCall(set, className),
      }),
    });
    await hold.arrived;
    const pending = halfPost(
      port,
      postPath,
      {},
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: writeCall(set, lateClass),
      },
    );
    await pending.sent;
    await new Promise((r) => setTimeout(r, 100));
    started.processLike.emit('SIGTERM');
    late = () => pending.finish().catch(() => undefined);
  }

  const lateSent = late();
  // The process exits with the update still held: no tool is awaited, and
  // the session's logoff reaches the system before the update is answered.
  const exit = await started.exited;
  let loggedOffUnderHold = true;
  await until(
    () =>
      standIn.requests.filter((r) => isLogoff(r.url)).length > logoffsBefore,
  ).catch(() => {
    loggedOffUnderHold = false;
  });
  hold.release();
  await lateSent;
  await new Promise((r) => setTimeout(r, 100));
  done();
  const log = standIn.requests;
  const update = log.findIndex(isUpdate);
  return {
    exit,
    loggedOffUnderHold,
    unlockSent: log.some(
      (r, i) => i > update && r.url.includes('_action=UNLOCK'),
    ),
    lateReached: log.some((r) => r.url.includes(lateClass.toLowerCase())),
  };
}

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: the shutdown, on both sets',
  (transportName) => {
    jest.setTimeout(60_000);

    it('a held write is not awaited: its session logged off under it, exit 0, no UNLOCK; a call after the latch reaches no tool', async () => {
      const full = await shutdownCase(transportName, 'full');
      const compact = await shutdownCase(transportName, 'compact');
      expect(full).toEqual({
        exit: 0,
        loggedOffUnderHold: true,
        unlockSent: false,
        lateReached: false,
      });
      expect(compact).toEqual(full);
    });
  },
);
