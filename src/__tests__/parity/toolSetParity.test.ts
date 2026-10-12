/**
 * Full and compact behave alike on every transport (D37, D49, spec §3.5,
 * §14.1): the tool set is the only input of a launcher that differs.
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
 * A8's cancellation case (D5): a call cancelled after its connection is
 * ready — while the system lookup an ABAP Cloud call makes first is held at
 * the stand-in — never reaches its tool, the same on both sets. A10 adds its
 * shutdown cases here. Every case runs
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
import * as compactSse from '../../../compact-sse/src/launcher';
import { HTTP_VERSION } from '../../../http/src/httpVersion';
import { main as httpMain } from '../../../http/src/launcher';
import { CORE_VERSION } from '../../../server/src/coreVersion';
import { main as coreMain } from '../../../server/src/launcher';
import { main as sseMain } from '../../../sse/src/launcher';
import { SSE_VERSION } from '../../../sse/src/sseVersion';
import { activeTools } from '../../lib/activeTools';
import { parametersHelp } from '../../lib/config/authParameters';
import {
  CREDENTIALS_REQUIRED_WORDS,
  DESTINATIONS_ONLY_STDIO_WORDS,
} from '../../lib/httpTransport';
import { fullToolSet, type ToolSet } from '../../lib/toolSet';
import { type AdtStandIn, adtStandIn, basicOf } from '../helpers/adtStandIn';

type TransportName = 'stdio' | 'http' | 'sse';
type SetName = 'full' | 'compact';

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
 * The six launchers: the full ones as their bins call them, the compact ones
 * through their own packages.
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
    compact: {
      main: (edges) => compactStdio.main(edges),
      toolSet: compactStdio.compactToolSet,
      program: 'mcp-abap-adt-compact',
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
    compact: {
      main: (edges) => compactHttp.main(edges),
      toolSet: compactHttp.compactToolSet,
      program: 'mcp-abap-adt-compact-http',
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
    compact: {
      main: (edges) => compactSse.main(edges),
      toolSet: compactSse.compactToolSet,
      program: 'mcp-abap-adt-compact-sse',
    },
  },
};

/** A read of one class on each set: the tool that sends it differs, nothing else. */
const readCall = (
  set: SetName,
  className = 'ZCL_PARITY',
): { name: string; arguments: Record<string, unknown> } =>
  set === 'full'
    ? { name: 'GetClass', arguments: { class_name: className } }
    : {
        name: 'HandlerGet',
        arguments: { object_type: 'CLASS', class_name: className },
      };
const READ_CALL: Record<SetName, ReturnType<typeof readCall>> = {
  full: readCall('full'),
  compact: readCall('compact'),
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

/** The exposition with the debugger, in each set's words. */
const DEBUG_EXPOSITION: Record<SetName, string> = {
  full: '--exposition=readonly,debug',
  compact: '--exposition=ro,debug',
};

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

/** The exposition row's own lines in a help text. */
function rowHelpOf(toolSet: ToolSet): string {
  const section = parametersHelp({
    program: 'x',
    rows: [toolSet.expositionRow],
    removed: [],
  });
  return section.slice('OPTIONS:\n'.length);
}

/**
 * The help, with what is the binary's own — its name, its exposition's row,
 * section and examples — set aside.
 */
async function helpOf(
  launcher: Launcher,
  transportName: TransportName,
): Promise<string> {
  const { stderr, exits } = await run(launcher, ['--help']);
  expect(exits).toEqual([0]);
  return stderr
    .join('\n')
    .split(launcher.toolSet.expositionExamples(launcher.program))
    .join('<exposition examples>')
    .split(`USAGE:\n  ${launcher.program} [options]`)
    .join('USAGE:\n  <program> [options]')
    .split(`\n  ${launcher.program} `)
    .join('\n  <program> ')
    .split(rowHelpOf(launcher.toolSet))
    .join('<exposition row>')
    .split(launcher.toolSet.expositionHelp(transportName))
    .join('<exposition section>');
}

/** The `--conf` template's keys and values, but for the exposition. */
async function templateOf(
  launcher: Launcher,
): Promise<{ exits: number[]; values: Record<string, unknown> }> {
  const file = path.join(workdir, `${launcher.program}.yaml`);
  const { exits } = await run(launcher, [`--conf=${file}`]);
  const values = load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.rmSync(file);
  expect(values.exposition).toEqual(
    (launcher.toolSet.expositionRow.default as string[]).join(','),
  );
  delete values.exposition;
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
  // A tool failure is JSON (§7.3); anything else is kept as it is, to be seen.
  if (!text.startsWith('{')) return { ok: false, text };
  return { ok: false, ...(JSON.parse(text) as Record<string, unknown>) };
}

/** The `Authorization` headers the stand-in received since `from`. */
const seenSince = (from: number) => [
  ...new Set(standIn.requests.slice(from).map((r) => r.authorization)),
];

/** One call with the stand-in answering, then one with it refusing the credential. */
async function callTwice(client: Client, set: SetName) {
  const from = standIn.requests.length;
  const answered = outcomeOf(await client.callTool(READ_CALL[set]));
  const presented = seenSince(from);
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
  const calls = await callTwice(destination.client, set);
  await destination.client.close();
  const destinationExit = await destination.started.stop();

  const inspection = await connect(['--system-type=onprem']);
  const inspectionOnly = outcomeOf(
    await inspection.client.callTool(READ_CALL[set]),
  );
  await inspection.client.close();
  const inspectionExit = await inspection.started.stop();

  const debug = await connect([
    `--env-path=${envFile}`,
    '--system-type=onprem',
    DEBUG_EXPOSITION[set],
  ]);
  const debugTools = await names(debug.client);
  await debug.client.close();
  await debug.started.stop();

  return {
    tools,
    debugTools,
    observed: {
      credential: calls.presented,
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
  const debugAt = at(await freePort());

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
  const basic = await callTwice(basicClient, set);
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

  // SSE: a POST is routed by its sessionId alone (ruling 14).
  const sseOnly =
    transportName === 'sse' ? await ssePosts(endpoint, set) : undefined;
  const exit = await started.stop();

  const debugStart = await run(launcher, [
    ...debugAt.listen,
    '--system-type=onprem',
    DEBUG_EXPOSITION[set],
  ]);
  const debugClient = await clientWith(basicHeaders(), debugAt.endpoint);
  const debugTools = await names(debugClient);
  await debugClient.close();
  await debugStart.stop();

  return {
    tools,
    debugTools,
    observed: {
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
    debugTools: served.debugTools,
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
 * (§7.3's `authentication_failed`) is C6's, so only its being a failure is
 * pinned here — full and compact are compared whole above.
 */
const USER_REFUSED = { ok: false };

const COMPACT_RW = [
  'HandlerActivate',
  'HandlerCreate',
  'HandlerDelete',
  'HandlerGet',
  'HandlerLock',
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
  '%s: full and compact differ only in their tools',
  (transportName) => {
    jest.setTimeout(120_000);

    it('observes the same behaviour through both launchers', async () => {
      const full = await observe(transportName, 'full');
      const compact = await observe(transportName, 'compact');

      // Everything but the tools is the transport's, the same for both sets.
      expect(compact.observed).toEqual(full.observed);

      // What was observed is the transport's behaviour, not two empty answers.
      const served = full.observed.served as Record<string, unknown>;
      if (transportName === 'stdio') {
        expect(served.credential).toEqual([
          basicOf('PARITY_USER', 'parity-password'),
        ]);
        expect(served.answered).toEqual({ ok: true });
        expect(served.refused).toMatchObject(USER_REFUSED);
        expect(served.inspectionOnly).toMatchObject({
          ok: false,
          error: 'inspection_only',
        });
      } else {
        const basic = served.basic as Record<string, unknown>;
        const token = served.token as Record<string, unknown>;
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

      // The tools: the object-oriented surface, and the compact facade.
      expect(full.tools).toContain('GetClass');
      expect(full.tools).not.toContain('HandlerGet');
      expect(compact.tools).toHaveLength(25);
      expect(compact.tools).toEqual(expect.arrayContaining(COMPACT_RW));
      expect(compact.tools).not.toContain('GetClass');

      // With debug in the exposition, the debugger's tools on each.
      expect(full.debugTools).toEqual(
        expect.arrayContaining(['DebugStartListener', 'DebugStop']),
      );
      expect(full.tools).not.toContain('DebugStartListener');
      expect(compact.debugTools).toEqual(expect.arrayContaining(COMPACT_DEBUG));
      expect(compact.debugTools).toHaveLength(16 + 4);
      expect(compact.tools).not.toContain('HandlerDebugStart');
    });
  },
);

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s compact: --exposition and the config file’s exposition are compact’s',
  (transportName) => {
    jest.setTimeout(60_000);
    const launcher = LAUNCHERS[transportName].compact;

    const listen = async () => {
      const port = await freePort();
      return transportName === 'http'
        ? ['--host=127.0.0.1', `--port=${port}`]
        : transportName === 'sse'
          ? ['--sse-host=127.0.0.1', `--sse-port=${port}`]
          : [];
    };

    const conf = (exposition: string) => {
      const file = path.join(workdir, 'compact.yaml');
      fs.writeFileSync(file, `exposition: ${exposition}\n`);
      return `--conf=${file}`;
    };

    /** The tools a start with `argv` serves (a listener of its own for HTTP and SSE). */
    const servedTools = async (argv: string[]): Promise<string[]> => {
      const at = await listen();
      const client = new Client({ name: 'parity', version: '1.0.0' });
      open.clients.push(client);
      let started: Run;
      if (transportName === 'stdio') {
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        started = await run(launcher, [...at, ...argv], serverSide);
        expect(started.exits).toEqual([]);
        await client.connect(clientSide);
      } else {
        started = await run(launcher, [...at, ...argv]);
        expect(started.exits).toEqual([]);
        const port = at[1].slice(at[1].indexOf('=') + 1);
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
      const tools = await names(client);
      await client.close();
      await started.stop();
      return tools;
    };

    it('exposition: ro serves the 16 that change nothing', async () => {
      const tools = await servedTools([conf('ro')]);
      expect(tools).toHaveLength(16);
      expect(tools).toContain('HandlerGet');
      expect(tools).not.toContain('HandlerCreate');
    });

    // 17.x's rule (PR #247): the last --exposition flag wins, and an empty
    // one is refused in compact's words — through the binary, not only the parser.
    it('the last flag wins: --exposition=readonly --exposition=ro serves ro', async () => {
      const tools = await servedTools([
        '--exposition=readonly',
        '--exposition=ro',
      ]);
      expect(tools).toHaveLength(16);
      expect(tools).not.toContain('HandlerCreate');
    });

    it('the last flag wins: --exposition=debug --exposition=ro,debug serves ro,debug', async () => {
      const tools = await servedTools([
        '--exposition=debug',
        '--exposition=ro,debug',
      ]);
      expect(tools).toHaveLength(16 + 4);
      expect(tools).toEqual(expect.arrayContaining(COMPACT_DEBUG));
    });

    it('a bare --exposition is refused in compact’s empty-value words', async () => {
      const { stderr, exits } = await run(launcher, [
        ...(await listen()),
        '--exposition',
      ]);
      expect(exits).toEqual([1]);
      expect(stderr).toEqual([
        "[MCP] --exposition was given no value. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 25), and 'debug' beside either. An empty value is refused rather than defaulted: an unset shell variable must not silently open the write tools.",
      ]);
    });

    it('a set of the full binaries is refused in compact’s words, naming the file', async () => {
      const { stderr, exits } = await run(launcher, [
        ...(await listen()),
        conf('readonly,high'),
      ]);
      expect(exits).toEqual([1]);
      const words = stderr.join('\n');
      expect(words).toContain('compact.yaml is refused');
      expect(words).toContain(
        "--exposition=readonly is not a compact set. This command takes 'ro'",
      );
    });

    it('the --conf template writes compact’s exposition, and help lists its words', async () => {
      const file = path.join(workdir, 'template.yaml');
      await run(launcher, [`--conf=${file}`]);
      const template = fs.readFileSync(file, 'utf8');
      expect((load(template) as Record<string, unknown>).exposition).toBe('rw');
      expect(template).toContain('ro (the 16 tools that change nothing)');
      expect(template).not.toContain('readonly,high');
      const { stderr } = await run(launcher, ['--help']);
      expect(stderr.join('\n')).toContain('--exposition=<ro|rw>[,debug]');
    });
  },
);

/** Each transport's compact binary, as the full binary of that transport names it (D49). */
const COMPACT_OF: Record<TransportName, { bin: string; pkg: string }> = {
  stdio: { bin: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
  http: { bin: 'mcp-abap-adt-compact-http', pkg: '@mcp-abap-adt/compact-http' },
  sse: { bin: 'mcp-abap-adt-compact-sse', pkg: '@mcp-abap-adt/compact-sse' },
};

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: each binary’s exposition words and examples are its own',
  (transportName) => {
    const full = LAUNCHERS[transportName].full;
    const compact = LAUNCHERS[transportName].compact;
    const { bin, pkg } = COMPACT_OF[transportName];

    it('the full binary refuses compact naming its transport’s compact binary', async () => {
      expect(await refusalOf(full, ['--exposition=compact'])).toEqual({
        stderr: [
          `[MCP] Invalid exposition: 'compact' is served by ${pkg}, which is its own command with the compact tool list as its default. Install it and run \`${bin}\`, or drop \`compact\` from this exposition.`,
        ],
        exits: [1],
      });
    });

    it('the full binary refuses ro (and any unknown word), never dropping it', async () => {
      expect(await refusalOf(full, ['--exposition=ro'])).toEqual({
        stderr: [
          `[MCP] Invalid exposition: 'ro' is not a set of this command, which takes readonly, high, low and debug, comma-separated. 'ro' and 'rw' are the sets of \`${bin}\` (${pkg}).`,
        ],
        exits: [1],
      });
      expect(await refusalOf(full, ['--exposition=readonly,search'])).toEqual({
        stderr: [
          "[MCP] Invalid exposition: 'search' is not a set of this command, which takes readonly, high, low and debug, comma-separated.",
        ],
        exits: [1],
      });
    });

    it('the full help names its transport’s compact binary and shows the full sets', async () => {
      const help = (await run(full, ['--help'])).stderr.join('\n');
      expect(help).toContain(`npm i -g ${pkg}\n`);
      expect(help).toContain(`\n                                     ${bin}\n`);
      expect(help).toContain(`  ${full.program} --exposition=readonly\n`);
      for (const other of Object.values(COMPACT_OF)) {
        if (other.pkg !== pkg) {
          expect(help).not.toContain(`npm i -g ${other.pkg}\n`);
          expect(help).not.toContain(`${other.bin}\n`);
        }
      }
    });

    it('the compact help shows its own examples, never the full binary’s', async () => {
      const help = (await run(compact, ['--help'])).stderr.join('\n');
      expect(help).toContain(`  ${compact.program} --exposition=ro\n`);
      expect(help).toContain(`  ${compact.program} --exposition=rw,debug\n`);
      expect(help).not.toContain('--exposition=readonly');
      expect(help).not.toContain(`  ${full.program} --`);
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
 * One read on a cloud system, its system lookup held at the stand-in, the
 * call cancelled the transport's way while it is held — an MCP cancel over
 * stdio and SSE; over Streamable HTTP, whose requests are each their own,
 * the client closing its request — then the lookup answered: whether the
 * read reached the stand-in, and how the server exited.
 */
async function cancelledRead(transportName: TransportName, set: SetName) {
  const launcher = LAUNCHERS[transportName][set];
  const className = 'ZCL_PARITY_CANCEL';
  const call = readCall(set, className);
  const hold = standIn.hold((r) => r.url.includes('systeminformation'));
  const controller = new AbortController();
  let started: Run;
  let client: Client | undefined;
  let done: Promise<unknown>;

  if (transportName === 'stdio') {
    const envFile = path.join(workdir, 'cancel.env');
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
    client = new Client({ name: 'parity', version: '1.0.0' });
    open.clients.push(client);
    started = await run(
      launcher,
      [`--env-path=${envFile}`, '--system-type=cloud'],
      serverSide,
    );
    await client.connect(clientSide);
    done = client
      .callTool(call, undefined, { signal: controller.signal })
      .catch(() => 'cancelled');
  } else if (transportName === 'sse') {
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
  // The server has seen the cancel: the call's signal is aborted.
  await until(
    () =>
      activeTools().length === 1 &&
      activeTools().every((tool) => tool.signal.aborted),
  );
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

describe.each<TransportName>(['stdio', 'http', 'sse'])(
  '%s: a cancelled call never reaches its tool, on both sets (D5)',
  (transportName) => {
    jest.setTimeout(60_000);

    it('cancelled after its connection is ready: no read reaches the system', async () => {
      const full = await cancelledRead(transportName, 'full');
      const compact = await cancelledRead(transportName, 'compact');
      expect(full).toEqual({ reached: false, exit: 0 });
      expect(compact).toEqual(full);
    });
  },
);
