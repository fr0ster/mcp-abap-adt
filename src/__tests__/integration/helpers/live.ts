/**
 * Live coverage cases (spec §8, "Live"; plan C1): a permanent Jest test
 * calls a tool by name on the on-premise system or the BTP trial and asserts
 * the operation itself.
 *
 * - `liveSuite(systems, title, body)` states where its cases run; without a
 *   config, or on a system it does not name, it skips and logs the reason.
 * - `liveCall(tool, args)` calls the tool — soft mode: the registered
 *   entry's `call` on the live connection, or an in-process server for the
 *   server-dispatched tools; hard mode: the MCP tool — and records its key
 *   against the current test's full name in the run's call log. Whether the
 *   key passed is the test's completed result, read by the run's reporter;
 *   nothing here decides it.
 * - `expectAbsent` / `expectCleared` assert a delete by its contract;
 *   `expectNameFree` reads a name before its create; `recordCreated` and
 *   `deleteRecorded` delete only what the test created, children first.
 * - Transport requests: the numbers a test created (`recordCreatedRequest`),
 *   a refused create reconciled around the call (`prepareRequestCreate` /
 *   `reconcileRequestCreate`, the task pair likewise), the entries it made
 *   (`recordTransportEntry`), and their cleanup (`deleteRecordedRequests`).
 *
 * **The refusal stop.** Every helper here refuses before it sends once the
 * run's credential-refusal marker exists, and an answer that is a
 * credential refusal writes it.
 *
 * The run's files (the marker, the call log, the leftovers named) live in
 * `MCP_ABAP_ADT_COVERAGE_RUN` when the run's setup names one, else in a
 * directory of this process under the OS temp directory — never in the
 * repository.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import type { McpResult } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { servedTools as plainEntries } from '../../helpers/batchHarness';
import { servedEntries } from '../../helpers/pinCases';
import {
  inProcessServer,
  type PinServer,
  type ServerSource,
} from '../../helpers/pinServer';
import type { SystemKind } from '../../helpers/servedTools';
import { toolAnswer } from '../../helpers/toolAnswer';
import { type CoverageKey, keyOf } from '../../unit/coverage/coverageKeys';
import { getTestDestination } from './authHelpers';
import { loadTestConfig } from './configHelpers';
import { endTestConnection, trackConnection } from './openConnections';
import { primeSystemContext } from './primeSystemContext';
import { setupSystemKind } from './setupSystemKind';
import { testConfigPathFromEnv } from './testConfigPath';
import { createHardModeClient, isHardModeEnabled } from './testers/hardMode';

export type { ToolArgs };

/** A tool's answer, with its text joined. */
export interface LiveAnswer extends McpResult {
  readonly text: string;
}

// ---------------------------------------------------------------------------
// The run's files

let ownRunDirectory: string | undefined;

/** Where this run's marker, call log and leftovers live. */
export function runDirectory(): string {
  const named = process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  if (named !== undefined && named.trim() !== '') {
    fs.mkdirSync(named, { recursive: true });
    return named;
  }
  if (ownRunDirectory === undefined) {
    ownRunDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'mcp-abap-adt-coverage-'),
    );
  }
  return ownRunDirectory;
}

const markerFile = () => path.join(runDirectory(), 'credential-refused');
const callLogFile = () => path.join(runDirectory(), 'calls.jsonl');
const leftoversFile = () => path.join(runDirectory(), 'leftovers.jsonl');

/** Latches the run's credential-refusal marker: nothing is sent after it. */
export function markCredentialRefused(): void {
  fs.writeFileSync(markerFile(), new Date().toISOString());
}

/** Whether the run's credential-refusal marker exists. */
export function credentialRefused(): boolean {
  return fs.existsSync(markerFile());
}

/** Refuses before anything is sent once the marker exists. */
function refuseAfterMarker(what: string): void {
  if (credentialRefused()) {
    throw new Error(
      `${what} is not sent: a credential was refused earlier in this run`,
    );
  }
}

/** One entry of the run's call log: which test called which key, on which system. */
export interface CallLogEntry {
  test: string;
  key: CoverageKey;
  system: SystemKind;
}

function logCall(entry: CallLogEntry): void {
  fs.appendFileSync(callLogFile(), `${JSON.stringify(entry)}\n`);
}

/** The run's call log, as written. */
export function callLog(): CallLogEntry[] {
  if (!fs.existsSync(callLogFile())) return [];
  return fs
    .readFileSync(callLogFile(), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line): CallLogEntry[] => {
      const parsed: unknown = JSON.parse(line);
      const test = member(parsed, 'test');
      const key = member(parsed, 'key');
      const system = member(parsed, 'system');
      return typeof test === 'string' &&
        typeof key === 'string' &&
        (system === 'onprem' || system === 'cloud')
        ? [{ test, key, system }]
        : [];
    });
}

/** How a key fared: its test's completed result. */
export type KeyOutcome = 'passed' | 'failed' | 'skipped';

/**
 * Each logged key's outcome on its system, joined with the tests' completed
 * results by full name: `passed` only when every test that called it
 * passed. The join the run's reporter makes from Jest's results.
 */
export function outcomesOf(
  log: readonly CallLogEntry[],
  results: ReadonlyArray<{ fullName: string; status: string }>,
): Map<string, KeyOutcome> {
  const statusOf = new Map(
    results.map((result) => [result.fullName, result.status]),
  );
  const outcomes = new Map<string, KeyOutcome>();
  for (const entry of log) {
    const status = statusOf.get(entry.test);
    const outcome: KeyOutcome =
      status === 'passed'
        ? 'passed'
        : status === 'failed'
          ? 'failed'
          : 'skipped';
    const id = `${entry.key} ${entry.system}`;
    const known = outcomes.get(id);
    if (known === undefined || known === 'passed') outcomes.set(id, outcome);
  }
  return outcomes;
}

/** Names what a run left behind for the owner to remove (the run report). */
function reportLeftover(what: string): void {
  fs.appendFileSync(leftoversFile(), `${JSON.stringify({ leftover: what })}\n`);
}

// ---------------------------------------------------------------------------
// Answers

/** A JSON value's member, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** An answer's text as JSON; `undefined` when it is not. */
function jsonOf(answer: LiveAnswer): unknown {
  try {
    return JSON.parse(answer.text);
  } catch {
    return undefined;
  }
}

/** Whether an answer is a credential refusal: `authentication_failed`, or a `401` SAP answered. */
function isCredentialRefusal(answer: LiveAnswer): boolean {
  if (!answer.isError) return false;
  const payload = jsonOf(answer);
  return (
    member(payload, 'error') === 'authentication_failed' ||
    member(payload, 'status') === 401
  );
}

/** Whether an answer is SAP's "not found" (`404`). */
function isNotFound(answer: LiveAnswer): boolean {
  return answer.isError && member(jsonOf(answer), 'status') === 404;
}

function liveAnswerOf(value: unknown): LiveAnswer {
  const answer = toolAnswer(value);
  const content = answer.content.map((item) => ({
    type: 'text' as const,
    text: item.text,
  }));
  return {
    isError: answer.isError === true,
    content,
    text: content.map((item) => item.text).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// How calls reach the system

/** How a run's calls reach the system, and as whom. */
export interface LiveRunner {
  readonly system: SystemKind;
  /** The SAP user the calls run as. */
  readonly user: string;
  call(tool: string, args: ToolArgs): Promise<LiveAnswer>;
  /** The test's own connection, for what no tool does (a request's delete). */
  connection(): IAbapConnection;
  close(): Promise<void>;
}

let runner: LiveRunner | undefined;

/** Sets the runner `liveCall` and the helpers use; `liveSuite` sets it in a run. */
export function useLiveRunner(next: LiveRunner | undefined): void {
  runner = next;
}

function current(): LiveRunner {
  if (runner === undefined) {
    throw new Error('no live runner: call liveCall inside a liveSuite');
  }
  return runner;
}

/** The tools the server dispatches, not their entry: every set tool outside the plain groups. */
let serverDispatched: ReadonlySet<string> | undefined;

function isServerDispatched(tool: string, args: ToolArgs): boolean {
  if (args.background === true) return true;
  if (serverDispatched === undefined) {
    const plain = plainEntries(noConnectionContext());
    serverDispatched = new Set(
      [
        ...servedEntries('onprem').keys(),
        ...servedEntries('cloud').keys(),
      ].filter((name) => !plain.has(name)),
    );
  }
  return serverDispatched.has(tool);
}

/**
 * Soft mode: the entry's `call` on `connection`, or an in-process server
 * built from `source` for the tools the server dispatches.
 */
export function softRunner(options: {
  system: SystemKind;
  user: string;
  connection: IAbapConnection;
  source: ServerSource;
}): LiveRunner {
  let server: Promise<PinServer> | undefined;
  return {
    system: options.system,
    user: options.user,
    connection: () => options.connection,
    call: async (tool, args) => {
      if (isServerDispatched(tool, args)) {
        server ??= inProcessServer(options.system, options.source);
        return liveAnswerOf(await (await server).call(tool, args));
      }
      const entry = servedEntries(options.system).get(tool);
      if (entry === undefined) {
        throw new Error(`the ${options.system} variant serves no tool ${tool}`);
      }
      return liveAnswerOf(
        await entry.call({ connection: options.connection }, args),
      );
    },
    close: async () => {
      if (server !== undefined) await (await server).close();
    },
  };
}

/** Hard mode: the MCP tool of the launched server; the connection is the test's own. */
async function hardRunner(
  system: SystemKind,
  user: string,
  connection: IAbapConnection,
): Promise<LiveRunner> {
  const hard = await createHardModeClient();
  return {
    system,
    user,
    connection: () => connection,
    call: async (tool, args) =>
      liveAnswerOf(
        await hard.client.callTool({ name: tool, arguments: { ...args } }),
      ),
    close: () => hard.close(),
  };
}

/** Whether a test config exists for this run (not the template). */
function hasTestConfig(): boolean {
  return (
    testConfigPathFromEnv() !== undefined ||
    fs.existsSync(
      path.join(__dirname, '..', '..', '..', '..', 'tests', 'test-config.yaml'),
    )
  );
}

/** The runner of a live run on the configured destination. */
async function liveRunner(system: SystemKind): Promise<LiveRunner> {
  const destination = await getTestDestination();
  if (destination === null) {
    throw new Error('the test config names no destination');
  }
  refuseAfterMarker('a connection');
  const connection = trackConnection(
    createAbapConnection(
      destination.settings,
      destination.credential,
      undefined,
      undefined,
      undefined,
      system,
    ),
  );
  await connection.connect();
  // The responsible person and master system a change is made for, as the
  // integration testers state them.
  await primeSystemContext(connection);
  const user = destination.settings.username ?? '';
  return isHardModeEnabled()
    ? hardRunner(system, user, connection)
    : softRunner({
        system,
        user,
        connection,
        source: {
          settings: destination.settings,
          credential: destination.credential,
        },
      });
}

/**
 * A suite of live cases on `systems`. Without a config, or on a system it
 * does not name, it skips and logs the reason.
 */
export function liveSuite(
  systems: readonly SystemKind[],
  title: string,
  body: () => void,
): void {
  const reason = !hasTestConfig()
    ? 'no test config (tests/test-config.yaml or MCP_TEST_CONFIG)'
    : undefined;
  const kind =
    reason === undefined ? setupSystemKind(loadTestConfig()) : undefined;
  const skipped =
    reason ??
    (kind === undefined
      ? 'no system kind stated (environment.system_type or SAP_SYSTEM_TYPE)'
      : systems.includes(kind)
        ? undefined
        : `the configured system is ${kind}; this suite runs on ${systems.join(', ')}`);
  if (skipped !== undefined || kind === undefined) {
    console.log(`[liveSuite] ${title}: skipped — ${skipped}`);
    describe.skip(title, body);
    return;
  }
  describe(title, () => {
    beforeAll(async () => {
      useLiveRunner(await liveRunner(kind));
    });
    afterAll(async () => {
      const ending = runner;
      useLiveRunner(undefined);
      if (ending !== undefined) {
        await ending.close();
        await endTestConnection(ending.connection());
      }
    });
    body();
  });
}

/** A call that is not the one under test (a read-back, a cleanup): the marker checked, nothing logged. */
async function send(tool: string, args: ToolArgs): Promise<LiveAnswer> {
  refuseAfterMarker(tool);
  const answer = await current().call(tool, args);
  if (isCredentialRefusal(answer)) markCredentialRefused();
  return answer;
}

/**
 * Calls `tool` with `args` and records its key against the current test's
 * full name. Await it in the test body; the guard refuses anything else.
 */
export async function liveCall(
  tool: string,
  args: ToolArgs,
): Promise<LiveAnswer> {
  refuseAfterMarker(tool);
  const test = expect.getState().currentTestName;
  if (test === undefined) throw new Error('liveCall runs inside a test');
  const run = current();
  logCall({ test, key: keyOf(tool, args), system: run.system });
  const answer = await run.call(tool, args);
  if (isCredentialRefusal(answer)) markCredentialRefused();
  return answer;
}

/** A read: the tool and its arguments. */
export interface LiveRead {
  tool: string;
  args: ToolArgs;
}

/** The object reads "not found" (`404`). */
export async function expectAbsent(read: LiveRead): Promise<void> {
  const answer = await send(read.tool, read.args);
  if (!isNotFound(answer)) {
    throw new Error(
      `${read.tool} still reads the object it should not find: ${answer.text}`,
    );
  }
}

/** The part reads empty, and the object still reads. */
export async function expectCleared(read: LiveRead): Promise<void> {
  const answer = await send(read.tool, read.args);
  if (answer.isError) {
    throw new Error(`${read.tool} no longer reads the object: ${answer.text}`);
  }
  if (answer.text.trim() !== '') {
    throw new Error(`${read.tool} reads the part not empty: ${answer.text}`);
  }
}

/** A name is free: its read answers "not found". Nothing is created or deleted. */
export async function expectNameFree(read: LiveRead): Promise<void> {
  const answer = await send(read.tool, read.args);
  if (!isNotFound(answer)) {
    throw new Error(
      `the name ${JSON.stringify(read.args)} is taken (or unreadable): nothing is created or deleted`,
    );
  }
}

/** What the test created, each with the delete that removes it, in creation order. */
const created: Array<{ tool: string; args: ToolArgs }> = [];

/** Records an object the test created, with the call that deletes it. */
export function recordCreated(deleteTool: string, args: ToolArgs): void {
  created.push({ tool: deleteTool, args });
}

/** Deletes only what was recorded, children before parents (reverse creation order). */
export async function deleteRecorded(): Promise<void> {
  const failures: string[] = [];
  while (created.length > 0) {
    const last = created.pop();
    if (last === undefined) break;
    const answer = await send(last.tool, last.args);
    if (answer.isError && !isNotFound(answer)) {
      failures.push(
        `${last.tool} ${JSON.stringify(last.args)}: ${answer.text}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`cleanup failed:\n${failures.join('\n')}`);
  }
}

// ---------------------------------------------------------------------------
// Transport requests

/** A transport entry's object. */
export interface TransportObjectRef {
  name: string;
  type: string;
  pgmid?: string;
}

/** The request and task numbers the test created, in creation order. */
const createdRequests: string[] = [];

/** The transport entries the test made. */
const journal: Array<{
  request: string;
  task: string;
  object: TransportObjectRef;
}> = [];

/** Records a request or task number the test created. */
export function recordCreatedRequest(transportNumber: string): void {
  if (!createdRequests.includes(transportNumber)) {
    createdRequests.push(transportNumber);
  }
}

/** Records a transport entry the test made, once the call that made it succeeded. */
export function recordTransportEntry(entry: {
  request: string;
  task: string;
  object: TransportObjectRef;
}): void {
  journal.push(entry);
}

/** The objects a request (or task) holds, with their task and position. */
async function transportObjects(transportNumber: string): Promise<
  Array<{
    name: string;
    type: string;
    pgmid: string;
    position: string;
    task: string;
  }>
> {
  const answer = await send('ReadTransportObjects', {
    transport_number: transportNumber,
  });
  if (answer.isError) {
    throw new Error(`ReadTransportObjects ${transportNumber}: ${answer.text}`);
  }
  const objects = member(jsonOf(answer), 'objects');
  if (!Array.isArray(objects)) return [];
  return objects.flatMap((each) => {
    const name = member(each, 'name');
    const type = member(each, 'type');
    const position = member(each, 'position');
    const pgmid = member(each, 'pgmid');
    const task = member(each, 'task');
    return typeof name === 'string' && typeof type === 'string'
      ? [
          {
            name,
            type,
            pgmid: typeof pgmid === 'string' ? pgmid : 'R3TR',
            position: typeof position === 'string' ? position : '',
            task: typeof task === 'string' ? task : transportNumber,
          },
        ]
      : [];
  });
}

const sameObject = (
  a: { name: string; type: string },
  b: TransportObjectRef,
): boolean => a.name === b.name && a.type === b.type;

/**
 * Cleans up what the test did to transport requests, in this order:
 * 1. the recorded objects deleted (`deleteRecorded`);
 * 2. every entry of a journalled object detached (`RemoveTransportObject`)
 *    from every task it is on — the journalled ones and any the delete
 *    added — across the journalled requests and the created ones;
 * 3. the final state read (`ReadTransportObjects`): no journalled object on
 *    a journalled request, the created ones empty;
 * 4. only then the recorded tasks and requests deleted, the later created
 *    first (a task before its request), each asserted absent with
 *    `GetTransport`. The order of step 4 is provisional until measured on
 *    the system (plan C2a).
 */
export async function deleteRecordedRequests(): Promise<void> {
  await deleteRecorded();
  const requests = new Set([
    ...journal.map((entry) => entry.request),
    ...createdRequests,
  ]);
  for (const request of requests) {
    for (const held of await transportObjects(request)) {
      if (!journal.some((entry) => sameObject(held, entry.object))) continue;
      const answer = await send('RemoveTransportObject', {
        transport_number: held.task,
        object_name: held.name,
        object_type: held.type,
        position: held.position,
        pgmid: held.pgmid,
      });
      if (answer.isError) {
        throw new Error(
          `RemoveTransportObject ${held.task} ${held.name}: ${answer.text}`,
        );
      }
    }
  }
  for (const request of requests) {
    const left = (await transportObjects(request)).filter(
      (held) =>
        createdRequests.includes(request) ||
        journal.some((entry) => sameObject(held, entry.object)),
    );
    if (left.length > 0) {
      throw new Error(
        `request ${request} still holds ${left.map((held) => held.name).join(', ')}`,
      );
    }
  }
  journal.length = 0;
  while (createdRequests.length > 0) {
    const transportNumber = createdRequests.pop();
    if (transportNumber === undefined) break;
    refuseAfterMarker(`the delete of ${transportNumber}`);
    const connection = current().connection();
    const deleted = await withAdtHeaders({}, 'request.delete', (headers) =>
      createAdtClient(connection)
        .getRequest(resultsFor(transportDocuments))
        .delete({ transportNumber }, { headers }),
    );
    if (!deleted.ok) {
      throw new Error(`the delete of ${transportNumber} was refused`);
    }
    const read = await send('GetTransport', {
      transport_number: transportNumber,
    });
    if (!isNotFound(read)) {
      throw new Error(`${transportNumber} still reads after its delete`);
    }
  }
}

/** The run's id: random per run, never a user or a system. */
const RUN_ID = randomBytes(4).toString('hex').toUpperCase();
let creates = 0;

/** Before a request create: its unique description and the user's modifiable requests now. */
export interface RequestCreatePlan {
  readonly description: string;
  readonly inventory: ReadonlySet<string>;
}

/** Before a task create under a test-owned request: the request's tasks now. */
export interface TaskCreatePlan {
  readonly parent: string;
  readonly tasks: ReadonlySet<string>;
}

/** The test user's modifiable requests: number → description. */
async function modifiableRequests(): Promise<Map<string, string>> {
  const answer = await send('ListTransports', {
    user: current().user,
    modifiable_only: true,
  });
  if (answer.isError) throw new Error(`ListTransports: ${answer.text}`);
  const listed = member(jsonOf(answer), 'transports');
  const out = new Map<string, string>();
  if (Array.isArray(listed)) {
    for (const each of listed) {
      const number = member(each, 'number');
      const description = member(each, 'description');
      if (typeof number === 'string') {
        out.set(number, typeof description === 'string' ? description : '');
      }
    }
  }
  return out;
}

/** A request's task numbers. */
async function tasksOf(parent: string): Promise<Set<string>> {
  const answer = await send('GetTransport', { transport_number: parent });
  if (answer.isError) throw new Error(`GetTransport ${parent}: ${answer.text}`);
  const tasks = member(jsonOf(answer), 'tasks');
  return new Set(
    Array.isArray(tasks)
      ? tasks
          .map((task) => member(task, 'number'))
          .filter((number): number is string => typeof number === 'string')
      : [],
  );
}

export async function prepareRequestCreate(): Promise<RequestCreatePlan> {
  creates += 1;
  const description = `MCP COVERAGE ${RUN_ID} ${creates}`;
  return {
    description,
    inventory: new Set((await modifiableRequests()).keys()),
  };
}

export async function prepareTaskCreate(
  parent: string,
): Promise<TaskCreatePlan> {
  return { parent, tasks: await tasksOf(parent) };
}

/** A created number from an answer's JSON, under `field`. */
function numberIn(answer: LiveAnswer, field: string): string | undefined {
  const value = member(jsonOf(answer), field);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * After a request create: on success the number is recorded at once. On a
 * non-credential failure the requests new against the inventory that carry
 * the plan's exact description are journalled, and the case fails; when
 * none is found, the description is reported. After a credential refusal
 * nothing more is sent, and the description is reported.
 */
export async function reconcileRequestCreate(
  plan: RequestCreatePlan,
  answer: LiveAnswer,
): Promise<void> {
  if (!answer.isError) {
    const created = numberIn(answer, 'transport_number');
    if (created === undefined) {
      reportLeftover(plan.description);
      throw new Error(
        `the create answered no number; look for "${plan.description}"`,
      );
    }
    recordCreatedRequest(created);
    return;
  }
  if (credentialRefused() || isCredentialRefusal(answer)) {
    reportLeftover(plan.description);
    throw new Error(
      `the create was refused for the credential; look for "${plan.description}"`,
    );
  }
  const found = [...(await modifiableRequests())].filter(
    ([number, description]) =>
      !plan.inventory.has(number) && description === plan.description,
  );
  for (const [number] of found) recordCreatedRequest(number);
  if (found.length === 0) {
    reportLeftover(plan.description);
    throw new Error(
      `the create failed and left nothing identifiable; look for "${plan.description}": ${answer.text}`,
    );
  }
  throw new Error(
    `the create failed; its leftover is journalled: ${answer.text}`,
  );
}

/**
 * After a task create: on success the task number is recorded at once. On a
 * non-credential failure the parent's tasks new against the plan's list are
 * journalled, and the case fails. After a credential refusal nothing more is
 * sent, and the parent's number is reported.
 */
export async function reconcileTaskCreate(
  plan: TaskCreatePlan,
  answer: LiveAnswer,
): Promise<void> {
  if (!answer.isError) {
    const created = numberIn(answer, 'task_number');
    if (created === undefined) {
      reportLeftover(plan.parent);
      throw new Error(
        `the task create answered no number under ${plan.parent}`,
      );
    }
    recordCreatedRequest(created);
    return;
  }
  if (credentialRefused() || isCredentialRefusal(answer)) {
    reportLeftover(plan.parent);
    throw new Error(
      `the task create was refused for the credential under ${plan.parent}`,
    );
  }
  const found = [...(await tasksOf(plan.parent))].filter(
    (task) => !plan.tasks.has(task),
  );
  for (const task of found) recordCreatedRequest(task);
  if (found.length === 0) {
    reportLeftover(plan.parent);
    throw new Error(
      `the task create failed and left nothing identifiable under ${plan.parent}: ${answer.text}`,
    );
  }
  throw new Error(
    `the task create failed; its leftover is journalled: ${answer.text}`,
  );
}

/** What the run report names as left behind: for the run report (C2) and the tests. */
export function leftovers(): string[] {
  if (!fs.existsSync(leftoversFile())) return [];
  return fs
    .readFileSync(leftoversFile(), 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => {
      const value = member(JSON.parse(line), 'leftover');
      return typeof value === 'string' ? [value] : [];
    });
}

/** The numbers recorded as created, in creation order: for the tests. */
export function recordedRequests(): readonly string[] {
  return [...createdRequests];
}
