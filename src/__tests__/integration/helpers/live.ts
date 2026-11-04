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
 * credential refusal writes it. Below them the connection itself is guarded
 * (`refusalGuard.ts`): the live connection, the in-process server's (handed
 * in as that connection) and every sibling either opens; a launched server
 * in hard mode answers to the parent (`launchedServers.ts`).
 *
 * The run's files (the marker, the call log, the leftovers named) live in
 * the run's directory (`coverageReport/reportFormat.ts`) — never in the
 * repository.
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import type { McpResult } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { fullToolSet } from '../../../lib/toolSet';
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
import {
  appendCall,
  appendLeftover,
  type CallLogEntry,
  readCallLog,
  readLeftovers,
} from '../coverageReport/reportFormat';
import { getTestDestination } from './authHelpers';
import { configuredSystemKind } from './configHelpers';
import { NO_KIND_STATED } from './configuredSystemKind';
import { type GuardedLaunch, launchGuarded } from './launchedServers';
import { endTestConnection, trackConnection } from './openConnections';
import { primeSystemContext } from './primeSystemContext';
import {
  credentialRefused,
  guardedTestConnection,
  markCredentialRefused,
  refusalAnswered,
  refuseAfterMarker,
} from './refusalGuard';
import { testConfigPathFromEnv } from './testConfigPath';
import {
  createHardModeClient,
  type HardModeSet,
  isHardModeEnabled,
} from './testers/hardMode';

export { runDirectory } from '../coverageReport/reportFormat';
export type { ToolArgs };
export { type CallLogEntry, credentialRefused, markCredentialRefused };

/** A tool's answer, with its text joined. */
export interface LiveAnswer extends McpResult {
  readonly text: string;
}

// ---------------------------------------------------------------------------
// The run's files

/** The run's call log, as written. */
export function callLog(): CallLogEntry[] {
  return readCallLog();
}

/** Names what a run left behind for the owner to remove (the run report). */
function reportLeftover(what: string): void {
  appendLeftover(what);
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
  return refusalAnswered(answer.isError, answer.text);
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

/** The full set's tool names: hard mode launches the compact binary for any other. */
let fullNames: ReadonlySet<string> | undefined;

function setOf(tool: string): HardModeSet {
  fullNames ??= new Set(
    (['stdio', 'http'] as const).flatMap((transport) =>
      fullToolSet
        .groups(noConnectionContext(), transport)
        .flatMap((group) =>
          group.getHandlers().map((entry) => entry.toolDefinition.name),
        ),
    ),
  );
  return fullNames.has(tool) ? 'full' : 'compact';
}

/**
 * Hard mode: the MCP tool of a launched server — the full binary for a full
 * tool, the compact one for a compact tool, each launched once its first
 * tool is called, after the parent logged on (`launchGuarded`); the
 * connection is the test's own.
 */
function hardRunner(
  system: SystemKind,
  user: string,
  connection: IAbapConnection,
  logOn: () => Promise<void>,
): LiveRunner {
  const launches = new Map<HardModeSet, Promise<GuardedLaunch>>();
  const launchOf = (set: HardModeSet): Promise<GuardedLaunch> => {
    const known = launches.get(set);
    if (known !== undefined) return known;
    const launched = launchGuarded({
      logOn,
      launch: () => createHardModeClient(set),
    });
    launches.set(set, launched);
    return launched;
  };
  return {
    system,
    user,
    connection: () => connection,
    call: async (tool, args) =>
      liveAnswerOf(await (await launchOf(setOf(tool))).call(tool, args)),
    close: async () => {
      for (const launched of launches.values()) {
        await (await launched).close();
      }
    },
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
  const open = () =>
    guardedTestConnection(destination.settings, destination.credential, {
      kind: system,
    });
  const connection = trackConnection(open());
  await connection.connect();
  // The responsible person and master system a change is made for, as the
  // integration testers state them.
  await primeSystemContext(connection);
  const user = destination.settings.username ?? '';
  if (isHardModeEnabled()) {
    // Before each launch, a logon of the parent's own with the same credentials.
    const logOn = async (): Promise<void> => {
      const own = open();
      await own.connect();
      await endTestConnection(own);
    };
    return hardRunner(system, user, connection, logOn);
  }
  // The in-process server uses the guarded connection as given; its fresh
  // connections are guarded siblings.
  return softRunner({
    system,
    user,
    connection,
    source: { injected: connection },
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
  const stated = reason === undefined ? configuredSystemKind() : undefined;
  const kind = stated === 'onprem' || stated === 'cloud' ? stated : undefined;
  const skipped =
    reason ??
    (stated === undefined
      ? NO_KIND_STATED
      : kind === undefined || !systems.includes(kind)
        ? `the configured system is ${stated}; this suite runs on ${systems.join(', ')}`
        : undefined);
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
  const { currentTestName: test, testPath: file } = expect.getState();
  if (test === undefined || file === undefined) {
    throw new Error('liveCall runs inside a test');
  }
  const run = current();
  appendCall({ file, test, key: keyOf(tool, args), system: run.system });
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

/**
 * Deletes only what was recorded, children before parents (reverse creation
 * order). A record goes only once its delete succeeded (or the object is
 * already gone): a failed delete keeps it, and a refused send (the marker)
 * keeps every one not yet deleted. Whatever is kept is named in the
 * leftovers report, and the cleanup fails.
 */
export async function deleteRecorded(): Promise<void> {
  const failures: string[] = [];
  const kept: Array<{ tool: string; args: ToolArgs }> = [];
  try {
    for (let at = created.length - 1; at >= 0; at -= 1) {
      const record = created[at];
      if (record === undefined) continue;
      const answer = await send(record.tool, record.args);
      if (answer.isError && !isNotFound(answer)) {
        kept.unshift(record);
        failures.push(
          `${record.tool} ${JSON.stringify(record.args)}: ${answer.text}`,
        );
      }
      created.splice(at, 1);
    }
  } finally {
    created.push(...kept);
    if (created.length > 0) reportRemaining();
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

/** The configured requests' entries as they were before the run touched them. */
const configured = new Map<string, ReadonlySet<string>>();

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

/**
 * Names in the leftovers report everything still recorded — objects,
 * requests and tasks, journalled entries — for the owner to remove.
 */
function reportRemaining(): void {
  for (const record of created) {
    reportLeftover(`object ${record.tool} ${JSON.stringify(record.args)}`);
  }
  for (const transportNumber of createdRequests) {
    reportLeftover(`request ${transportNumber}`);
  }
  for (const entry of journal) {
    reportLeftover(
      `entry ${entry.request}/${entry.task} ${entry.object.type} ${entry.object.name}`,
    );
  }
}

/** One entry a request (or task) holds. */
interface HeldEntry {
  name: string;
  type: string;
  pgmid: string;
  position: string;
  task: string;
}

const entryText = (held: HeldEntry): string =>
  `${held.pgmid} ${held.type} ${held.name}`;

/** The entries a request (or task) holds, with their task and position. */
async function transportObjects(transportNumber: string): Promise<HeldEntry[]> {
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

/**
 * Reads a configured request's entries before the run changes it: the
 * state `deleteRecordedRequests` restores and verifies. Call it before the
 * first entry the test makes on that request.
 */
export async function rememberConfiguredRequest(
  transportNumber: string,
): Promise<void> {
  if (configured.has(transportNumber)) return;
  configured.set(
    transportNumber,
    new Set((await transportObjects(transportNumber)).map(entryText)),
  );
}

/** The object names a recorded delete names: its `…_name` arguments, upper-cased. */
function recordedNames(): Set<string> {
  const names = new Set<string>();
  for (const record of created) {
    for (const [field, value] of Object.entries(record.args)) {
      if (field.endsWith('_name') && typeof value === 'string') {
        names.add(value.toUpperCase());
      }
    }
  }
  return names;
}

/**
 * Cleans up what the test did to transport requests, in this order:
 * 1. the recorded objects deleted (`deleteRecorded`);
 * 2. every entry of a recorded object (journalled or not) detached
 *    (`RemoveTransportObject`) from every task it is on — the journalled
 *    ones and any the delete added — across the configured requests and
 *    the created ones; an entry a configured request held before the run
 *    stays;
 * 3. the final state read (`ReadTransportObjects`): each configured request
 *    back as it was (`rememberConfiguredRequest`), the created ones empty;
 * 4. only then the recorded tasks and requests deleted, the later created
 *    first (a task before its request), each asserted absent with
 *    `GetTransport`. The order of step 4 is provisional until measured on
 *    the system (plan C2a).
 * A record goes only once its step succeeded; when a step fails, or a send
 * is refused, everything still recorded is named in the leftovers report.
 */
export async function deleteRecordedRequests(): Promise<void> {
  try {
    const names = recordedNames();
    for (const entry of journal) names.add(entry.object.name.toUpperCase());
    await deleteRecorded();
    for (const entry of journal) {
      if (
        !configured.has(entry.request) &&
        !createdRequests.includes(entry.request)
      ) {
        throw new Error(
          `request ${entry.request} was not remembered before the run changed it (rememberConfiguredRequest)`,
        );
      }
    }
    const requests = [...configured.keys(), ...createdRequests];
    for (const request of requests) {
      const before = configured.get(request) ?? new Set<string>();
      for (const held of await transportObjects(request)) {
        if (!names.has(held.name.toUpperCase())) continue;
        if (before.has(entryText(held))) continue;
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
      const now = (await transportObjects(request)).map(entryText).sort();
      const was = [...(configured.get(request) ?? [])].sort();
      if (JSON.stringify(now) !== JSON.stringify(was)) {
        throw new Error(
          `request ${request} is not back as it was: it holds ${now.join(', ') || 'nothing'}, it held ${was.join(', ') || 'nothing'}`,
        );
      }
    }
    journal.length = 0;
    while (createdRequests.length > 0) {
      const transportNumber = createdRequests[createdRequests.length - 1];
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
      createdRequests.pop();
    }
  } catch (error) {
    reportRemaining();
    throw error;
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

/** A request's description, from its own document (`GetTransport`). */
async function descriptionOf(transportNumber: string): Promise<string> {
  const answer = await send('GetTransport', {
    transport_number: transportNumber,
  });
  if (answer.isError) {
    throw new Error(`GetTransport ${transportNumber}: ${answer.text}`);
  }
  const description = member(
    member(jsonOf(answer), 'transport'),
    'description',
  );
  return typeof description === 'string' ? description : '';
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
  const found: Array<[string, string]> = [];
  for (const [number, listed] of await modifiableRequests()) {
    if (plan.inventory.has(number)) continue;
    // A listing that carries no description: the request's own document says.
    const description = listed !== '' ? listed : await descriptionOf(number);
    if (description === plan.description) found.push([number, description]);
  }
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
  return readLeftovers();
}

/** Forgets every record of this module: for the live helpers' own tests, between cases. */
export function resetLiveRecords(): void {
  created.length = 0;
  createdRequests.length = 0;
  journal.length = 0;
  configured.clear();
}

/** The numbers recorded as created, in creation order: for the tests. */
export function recordedRequests(): readonly string[] {
  return [...createdRequests];
}
