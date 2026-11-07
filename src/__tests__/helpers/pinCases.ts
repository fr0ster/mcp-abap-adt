/**
 * Pins: a tool's whole recorded request list, asserted as a literal (spec
 * §8, "Pinned").
 *
 * A case runs real adt-clients code on a parity stand-in and calls the tool
 * where its call is dispatched:
 * - `recording`: the variant's registered entry (`entry.call(context, args)`,
 *   so the schema parse is part of the case) on `recordingConnection`;
 * - `adtStandIn`: the same entry on a real connection to the ADT stand-in,
 *   bound to the pin file's fixed port;
 * - `server`: the tool by name through `pinServer` (the batch, the
 *   background runs, the debugger, the long and leftover sessions).
 *
 * The recorded request is kept whole (`toPinned`): method, path and query,
 * every header, body. Before a case sends, its clock and random sources are
 * fixed (`PIN_EPOCH`, `seededCrypto`) — installed before the stand, the
 * connection and the server are built — and restored after it, also on a
 * failure; every case records twice, and the two recordings must be equal
 * byte for byte before either is compared with `expected`.
 *
 * Ports kept for pins: 47100–47199, one per pin file, each file's own
 * recorded in `PIN_PORT_OWNERS` and read with `pinPort(__filename)`.
 */

import crypto from 'node:crypto';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { compactToolSet } from '../../../compact/src/launcher';
import type { McpResult } from '../../lib/answer';
import { createAbapConnection } from '../../lib/connectionFactory';
import type { HandlerEntry, ToolArgs } from '../../lib/handlers/interfaces';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { listedTool, statedEnvironment } from '../../lib/listedTool';
import { declareSystemKind } from '../../lib/systemKind';
import { fullToolSet } from '../../lib/toolSet';
import { endTestConnection } from '../integration/helpers/openConnections';
import {
  type CoverageKey,
  isDimension,
  keyOf,
} from '../unit/coverage/coverageKeys';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInHold,
  type StandInRequest,
} from './adtStandIn';
import { holdingLockOf } from './heldLocks';
import { type PinSetup, pinServer } from './pinServer';
import {
  type RecordedRequest,
  recordingConnection,
} from './recordingConnection';
import type { SystemKind } from './servedTools';
import { toolAnswer } from './toolAnswer';

export type { McpResult, PinSetup };

/** The clock every pin runs at. */
export const PIN_EPOCH = Date.UTC(2026, 0, 1);

/** The ports kept for pins' stand-ins: each pin file takes one, as a constant. */
export const PIN_PORTS = { first: 47100, last: 47199 } as const;

/**
 * Every pin file that takes a stand-in port, and its port, from
 * `PIN_PORTS`: one port per file, never shared, so pin files can run in
 * parallel. A new pin file adds its row here and reads its port with
 * `pinPort(__filename)`; `pinCases.test.ts` checks the rows.
 */
export const PIN_PORT_OWNERS: Readonly<Record<string, number>> = {
  'src/__tests__/unit/coverage/pinCases.test.ts': 47100,
  'src/__tests__/unit/systemKind/programOnJwtOnPremise.test.ts': 47101,
  'src/__tests__/unit/pins/backgroundRuns.pins.test.ts': 47102,
  'src/__tests__/unit/pins/searchSource.pins.test.ts': 47103,
};

/** The repository root, from this helper's place. */
const PIN_REPO = path.join(__dirname, '..', '..', '..');

/** The port `PIN_PORT_OWNERS` records for the pin file `file`; refused when none. */
export function pinPort(file: string): number {
  const owner = path.relative(PIN_REPO, file).split(path.sep).join('/');
  const port = PIN_PORT_OWNERS[owner];
  if (port === undefined) {
    throw new Error(
      `${owner} has no row in PIN_PORT_OWNERS: add it with a free port`,
    );
  }
  return port;
}

/** One request as sent: method, path with its query, every header, body. */
export interface PinnedRequest {
  method: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string | undefined;
}

/** An argument read from an earlier answer: `before[from]`'s field `field`. */
export interface Binding {
  from: number;
  field: string;
}

export interface PinCase {
  tool: string;
  variant: SystemKind;
  stand: 'recording' | 'adtStandIn' | 'server';
  setup?: PinSetup;
  args: ToolArgs;
  bind?: Readonly<Record<string, Binding>>;
  answers?: ReadonlyArray<Partial<IAdtWireResponse> | undefined>;
  before?: ReadonlyArray<{
    tool: string;
    args: ToolArgs;
    bind?: Readonly<Record<string, Binding>>;
  }>;
  refusal?: 'answer' | 'thrown';
  /**
   * What a `server` case waits for at the stand-in, so its window holds
   * what it sends and nothing else, without a timer:
   * - `own-session`: the case's call opens a session of its own (a listed
   *   long tool's) and logs it off as it ends; the case's requests are read
   *   once that logoff has arrived, so it is among them;
   * - `background-runs`: before the case's own call, every
   *   background run its `before` steps started has ended (its answer kept)
   *   and its session's logoff has arrived, outside the case's window.
   */
  settle?: 'own-session' | 'background-runs';
  expected: readonly PinnedRequest[] | 'none' | 'nothing-sent';
  ran?: (answer: McpResult) => void;
}

/** A pin file's fixed stand-in port. */
export interface PinOptions {
  port?: number;
  /**
   * The entries a case finds its tool among, in place of the variant's
   * served ones: for `pinCases`' own tests (a stub tool), never a pin file.
   */
  entries?: ReadonlyMap<string, HandlerEntry>;
}

// ---------------------------------------------------------------------------
// The adapter

/** The fields of a stand-in record derived from its header map or its target. */
const STAND_DERIVED = new Set([
  'authorization',
  'sessionType',
  'cookie',
  'contentType',
  'accept',
  'query',
]);

/** The stand-in's own fields, never sent: excluded by name, and only these. */
const STAND_OWN = new Set(['session']);

const STAND_WIRE = new Set(['method', 'url', 'headers', 'body']);

const RECORDED_WIRE = new Set(['method', 'url', 'data', 'params', 'headers']);

/** A recorded body as sent: a string, a buffer's text, or none (`undefined`, `null`). */
function bodyOf(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  throw new Error(
    `the recorded body is a ${typeof data}: the pinned shape has no place for it`,
  );
}

/** A recorded query's parameters, in their recorded order. */
function queryOf(params: unknown): string {
  if (params === undefined || params === null) return '';
  if (typeof params !== 'object') {
    throw new Error('the recorded params are not an object');
  }
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    const values: unknown[] = Array.isArray(value) ? value : [value];
    for (const each of values) {
      if (each === undefined || each === null) continue;
      if (
        typeof each !== 'string' &&
        typeof each !== 'number' &&
        typeof each !== 'boolean'
      ) {
        throw new Error(`the recorded param ${name} is not a plain value`);
      }
      query.append(name, String(each));
    }
  }
  return query.toString();
}

/** Refuses a record field the pinned shape has no place for. */
function refuseUnknown(
  record: object,
  known: ReadonlySet<string>,
  what: string,
): void {
  const unknown = Object.keys(record).filter((field) => !known.has(field));
  if (unknown.length > 0) {
    throw new Error(
      `${what} carries ${unknown.join(', ')}: the pinned shape has no place for it`,
    );
  }
}

/**
 * The one adapter from a stand's record to the pinned shape. From
 * `recordingConnection`: the URL joined with its params in their recorded
 * order, `data` as the body. From `adtStandIn`: its raw target and its full
 * header map. `StandInRequest.session` (the stand's ABAP session label) is
 * excluded by name; any other field the shape has no place for fails.
 */
export function toPinned(
  recorded: RecordedRequest | StandInRequest,
): PinnedRequest {
  if ('session' in recorded) {
    refuseUnknown(
      recorded,
      new Set([...STAND_WIRE, ...STAND_DERIVED, ...STAND_OWN]),
      'the stand-in record',
    );
    return {
      method: recorded.method,
      url: recorded.url,
      headers: { ...recorded.headers },
      body: recorded.body === '' ? undefined : recorded.body,
    };
  }
  refuseUnknown(recorded, RECORDED_WIRE, 'the recorded request');
  const query = queryOf(recorded.params);
  const joiner = recorded.url.includes('?') ? '&' : '?';
  return {
    method: recorded.method,
    url: query === '' ? recorded.url : `${recorded.url}${joiner}${query}`,
    headers: { ...(recorded.headers ?? {}) },
    body: bodyOf(recorded.data),
  };
}

// ---------------------------------------------------------------------------
// Deterministic inputs

/** A seeded sequence of 32-bit values: mulberry32 over the FNV-1a hash of `seed`. */
function seededSource(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** The seeded replacements of a case's random sources. */
export function seededCrypto(seed: string) {
  const next = seededSource(seed);
  const bytes = (size: number): Buffer => {
    const out = Buffer.alloc(size);
    for (let i = 0; i < size; i += 1) out[i] = next() & 0xff;
    return out;
  };
  const hex = (size: number) => bytes(size).toString('hex');
  return {
    randomBytes: bytes,
    randomUUID: (): `${string}-${string}-${string}-${string}-${string}` =>
      `${hex(4)}-${hex(2)}-4${hex(2).slice(1)}-a${hex(2).slice(1)}-${hex(6)}`,
    random: () => next() / 0x100000000,
  };
}

/** Every timer API but `Date`: left real, so timers, ticks and I/O run. */
const REAL_TIMERS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

/**
 * Fixes the clock at `PIN_EPOCH` and every random source a case can reach
 * to `seed`'s sequences; the answer restores each.
 */
export function installPinFakes(seed: string): () => void {
  jest.useFakeTimers({ now: PIN_EPOCH, doNotFake: [...REAL_TIMERS] });
  const seeded = seededCrypto(seed);
  const spies = [
    jest.spyOn(crypto, 'randomUUID').mockImplementation(seeded.randomUUID),
    jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation((size: number) => seeded.randomBytes(size)),
    jest.spyOn(Math, 'random').mockImplementation(seeded.random),
  ];
  return () => {
    for (const spy of spies) spy.mockRestore();
    jest.useRealTimers();
  };
}

// ---------------------------------------------------------------------------
// Running a case

/** The tools a variant serves through their entries, by name. */
const entriesByVariant = new Map<
  SystemKind,
  ReadonlyMap<string, HandlerEntry>
>();

export function servedEntries(
  variant: SystemKind,
): ReadonlyMap<string, HandlerEntry> {
  const known = entriesByVariant.get(variant);
  if (known !== undefined) return known;
  const environment = statedEnvironment(variant);
  const entries = new Map<string, HandlerEntry>();
  for (const toolSet of [fullToolSet, compactToolSet]) {
    for (const transport of ['stdio', 'http'] as const) {
      for (const group of toolSet.groups(noConnectionContext(), transport)) {
        for (const entry of group.getHandlers()) {
          const name = entry.toolDefinition.name;
          if (entries.has(name)) continue;
          if (listedTool(entry.toolDefinition, environment).listed) {
            entries.set(name, entry);
          }
        }
      }
    }
  }
  entriesByVariant.set(variant, entries);
  return entries;
}

/** The entry `variant` serves as `tool`; refused when it serves none. */
function entryOf(
  tool: string,
  variant: SystemKind,
  options: PinOptions,
): HandlerEntry {
  const entry = (options.entries ?? servedEntries(variant)).get(tool);
  if (entry === undefined) {
    throw new Error(`the ${variant} variant serves no tool ${tool}`);
  }
  return entry;
}

/** A tool's answer in the result shape. */
function resultOf(value: unknown): McpResult {
  const answer = toolAnswer(value);
  return {
    isError: answer.isError === true,
    content: answer.content.map((item) => ({ type: 'text', text: item.text })),
  };
}

/** The value of `binding` from the answers so far. */
function bound(binding: Binding, answers: readonly McpResult[]): unknown {
  const answer = answers[binding.from];
  if (answer === undefined) {
    throw new Error(
      `a binding reads before[${binding.from}], which has not run`,
    );
  }
  const text = answer.content[0]?.text ?? '';
  const parsed: unknown = JSON.parse(text);
  const value =
    typeof parsed === 'object' && parsed !== null && binding.field in parsed
      ? Reflect.get(parsed, binding.field)
      : undefined;
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `before[${binding.from}] answered no ${binding.field} to bind`,
    );
  }
  return value;
}

/** `args` with each binding read from the answers so far; a key-bearing field is refused. */
function withBindings(
  args: ToolArgs,
  bind: Readonly<Record<string, Binding>> | undefined,
  answers: readonly McpResult[],
): ToolArgs {
  if (bind === undefined) return args;
  const out: Record<string, unknown> = { ...args };
  for (const [field, binding] of Object.entries(bind)) {
    if (isDimension(field)) {
      throw new Error(
        `a binding of ${field} is refused: key-bearing fields stay in the args literal`,
      );
    }
    out[field] = bound(binding, answers);
  }
  return out;
}

/** What one run of a case recorded. */
export interface Recording {
  requests: PinnedRequest[];
  answer: McpResult | undefined;
  thrown: unknown;
}

/** The stand-in answers `answers[i]` to its i-th request, where one is given. */
function answerByIndex(stand: AdtStandIn, answers: PinCase['answers']): void {
  if (answers === undefined) return;
  stand.respond(
    (request) => answers[stand.requests.indexOf(request)] !== undefined,
    (request) => {
      const given = answers[stand.requests.indexOf(request)];
      const data = given?.data;
      if (data !== undefined && typeof data !== 'string') {
        throw new Error('an adtStandIn answer carries text data only');
      }
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(given?.headers ?? {})) {
        headers[name] = String(value);
      }
      return { status: given?.status ?? 200, headers, text: data ?? '' };
    },
  );
}

/**
 * Settles when the next request `match` accepts has arrived at the stand-in
 * (it is then among its requests); the request is answered as ever, at
 * once — a hold released as it arrives.
 */
function arrivalOf(
  stand: AdtStandIn,
  match: (request: StandInRequest) => boolean,
): Promise<void> {
  const hold: StandInHold = stand.hold(match);
  return hold.arrived.then(() => hold.release());
}

/**
 * The calls of `before`, then `between`, then the case's own: the answers,
 * and where its requests begin.
 */
async function runCalls(
  c: PinCase,
  call: (tool: string, args: ToolArgs) => Promise<McpResult>,
  sent: () => number,
  mark: { from: number },
  between?: () => Promise<void>,
): Promise<McpResult> {
  const answers: McpResult[] = [];
  for (const step of c.before ?? []) {
    answers.push(
      await call(step.tool, withBindings(step.args, step.bind, answers)),
    );
  }
  await between?.();
  const args = withBindings(c.args, c.bind, answers);
  // The case's own requests begin here, whether its call answers or throws.
  mark.from = sent();
  return call(c.tool, args);
}

/**
 * One run of `c`: the fakes installed first, then the stand, the connection
 * or the server built, the calls made, everything closed and restored.
 */
export async function recordCase(
  c: PinCase,
  options: PinOptions = {},
): Promise<Recording> {
  const restore = installPinFakes(`${keyOf(c.tool, c.args)} ${c.variant}`);
  const closing: Array<() => Promise<void>> = [];
  try {
    if (c.stand === 'recording') {
      if (c.settle !== undefined) {
        throw new Error("settle needs stand: 'server'");
      }
      const connection = recordingConnection([...(c.answers ?? [])]);
      declareSystemKind(connection, c.variant);
      const call = async (tool: string, args: ToolArgs) =>
        resultOf(
          await entryOf(tool, c.variant, options).call(
            { connection, heldLocks: holdingLockOf(args) },
            args,
          ),
        );
      const mark = { from: connection.requests.length };
      try {
        const answer = await runCalls(
          c,
          call,
          () => connection.requests.length,
          mark,
        );
        return {
          requests: connection.requests.slice(mark.from).map(toPinned),
          answer,
          thrown: undefined,
        };
      } catch (thrown) {
        return {
          requests: connection.requests.slice(mark.from).map(toPinned),
          answer: undefined,
          thrown,
        };
      }
    }
    if (options.port === undefined) {
      throw new Error(
        `a ${c.stand} pin needs its file's fixed port (pinCases' port)`,
      );
    }
    const stand = await adtStandIn({ port: options.port });
    closing.push(() => stand.close());
    answerByIndex(stand, c.answers);
    let call: (tool: string, args: ToolArgs) => Promise<McpResult>;
    // What the case waits for before its own call (`settle`).
    let between: (() => Promise<void>) | undefined;
    // The case's own session's logoff, held from its call on (`own-session`).
    const own: { logoff?: Promise<void> } = {};
    if (c.stand === 'server') {
      const server = await pinServer(c.variant, stand, c.setup);
      closing.unshift(() => server.close());
      call = (tool, args) => server.call(tool, args);
      if (c.settle === 'own-session') {
        between = async () => {
          own.logoff = arrivalOf(stand, (request) => isLogoff(request.url));
        };
      }
      if (c.settle === 'background-runs') {
        // Armed before the steps: the logoff of the run they start.
        const runLogoff = arrivalOf(stand, (request) => isLogoff(request.url));
        between = async () => {
          await server.runsEnded();
          await runLogoff;
        };
      }
    } else if (c.settle !== undefined) {
      throw new Error("settle needs stand: 'server'");
    } else {
      const connection = createAbapConnection(
        {
          url: stand.url,
          client: '100',
          authType: 'basic',
          username: 'PIN_USER',
        },
        new BasicAuthProvider('PIN_USER', 'pin-password'),
        undefined,
        undefined,
        undefined,
        c.variant,
      );
      closing.unshift(() => endTestConnection(connection));
      // Logged on before the case: its requests are the tool's, not the logon's.
      await connection.connect();
      call = async (tool, args) =>
        resultOf(
          await entryOf(tool, c.variant, options).call(
            { connection, heldLocks: holdingLockOf(args) },
            args,
          ),
        );
    }
    const mark = { from: stand.requests.length };
    try {
      const answer = await runCalls(
        c,
        call,
        () => stand.requests.length,
        mark,
        between,
      );
      if (own.logoff !== undefined) await own.logoff;
      const requests = stand.requests.slice(mark.from).map(toPinned);
      return { requests, answer, thrown: undefined };
    } catch (thrown) {
      return {
        requests: stand.requests.slice(mark.from).map(toPinned),
        answer: undefined,
        thrown,
      };
    }
  } finally {
    for (const close of closing) await close();
    restore();
  }
}

/** The first field in which two recordings differ; `undefined` when equal byte for byte. */
export function firstDifference(
  a: readonly PinnedRequest[],
  b: readonly PinnedRequest[],
): string | undefined {
  if (a.length !== b.length) return `the count: ${a.length} and ${b.length}`;
  for (let i = 0; i < a.length; i += 1) {
    const one = a[i];
    const two = b[i];
    if (one === undefined || two === undefined) return `request ${i}`;
    if (one.method !== two.method) return `request ${i}: method`;
    if (one.url !== two.url)
      return `request ${i}: url (${one.url} and ${two.url})`;
    const names = new Set([
      ...Object.keys(one.headers),
      ...Object.keys(two.headers),
    ]);
    for (const name of names) {
      if (one.headers[name] !== two.headers[name]) {
        return `request ${i}: header ${name} (${one.headers[name]} and ${two.headers[name]})`;
      }
    }
    if (one.body !== two.body) return `request ${i}: body`;
  }
  return undefined;
}

/** The start of `invalidArgumentsWords`' text for `tool`. */
const invalidArgumentsStart = (tool: string): string =>
  `Input validation error: Invalid arguments for tool ${tool}: `;

/** One case, asserted: throws naming what is wrong. */
export async function runPinCase(
  c: PinCase,
  options: PinOptions = {},
): Promise<void> {
  if (c.expected === 'nothing-sent' && c.refusal !== 'thrown') {
    throw new Error(
      "expected: 'nothing-sent' is legal only with refusal: 'thrown'",
    );
  }
  if (c.refusal === 'thrown' && c.expected !== 'nothing-sent') {
    throw new Error("refusal: 'thrown' requires expected: 'nothing-sent'");
  }
  if (c.expected === 'none' && c.ran === undefined) {
    throw new Error(
      "expected: 'none' requires ran, asserting the tool's own result",
    );
  }
  entryOf(c.tool, c.variant, options);
  for (const bind of [c.bind, ...(c.before ?? []).map((step) => step.bind)]) {
    for (const field of Object.keys(bind ?? {})) {
      if (isDimension(field)) {
        throw new Error(
          `a binding of ${field} is refused: key-bearing fields stay in the args literal`,
        );
      }
    }
  }
  const first = await recordCase(c, options);
  const second = await recordCase(c, options);
  const differs = firstDifference(first.requests, second.requests);
  if (differs !== undefined) {
    throw new Error(`two recordings of the case differ at ${differs}`);
  }
  if (Array.isArray(c.expected) && c.expected.length === 0) {
    throw new Error(
      `an empty expected is refused; recorded:\n${JSON.stringify(first.requests, null, 2)}`,
    );
  }
  if (c.refusal === 'thrown') {
    const message = first.thrown instanceof Error ? first.thrown.message : '';
    expect(message.startsWith(invalidArgumentsStart(c.tool))).toBe(true);
    expect(first.requests).toEqual([]);
    return;
  }
  if (first.thrown !== undefined) throw first.thrown;
  const answer = first.answer;
  if (answer === undefined) throw new Error('the call answered nothing');
  expect({ isError: answer.isError }).toEqual({
    isError: c.refusal === 'answer',
  });
  if (c.expected === 'none') {
    expect(first.requests).toEqual([]);
    c.ran?.(answer);
    return;
  }
  if (c.expected === 'nothing-sent') return;
  expect(first.requests).toEqual(c.expected);
}

/** The key a case stands for: `keyOf(tool, args)`. */
export const pinKey = (c: PinCase): CoverageKey => keyOf(c.tool, c.args);

/**
 * One `it('<key> (<variant>) sends the pinned requests')` per case. Call it
 * at the top level or in a `describe` callback: the guard refuses a call
 * Jest never collects. `options.port`: the file's fixed stand-in port, from
 * `pinPort(__filename)`, for its `adtStandIn` and `server` cases.
 */
export function pinCases(
  cases: readonly PinCase[],
  options: PinOptions = {},
): void {
  for (const c of cases) {
    it(`${pinKey(c)} (${c.variant}) sends the pinned requests`, async () => {
      await runPinCase(c, options);
    });
  }
}
