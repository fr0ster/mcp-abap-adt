/**
 * The communication batch through the served tools (spec §9.3, plan Task 28),
 * on the configured system.
 *
 * Hard mode: the test starts the compact server over stdio — the compact
 * command's own `main` (`compact/src/launcher.ts`), run from source through
 * tsx with `tsconfig.test.json`'s package paths — and calls its tools by name
 * through an MCP client, as a model does. The server connects with the
 * session file the config names (`environment.env`), over the transport the
 * config names (`environment.connection_type`, `--connection-type`).
 *
 * Where it runs: the system the config names, when the case
 * `batch.test_cases.communication` is enabled — one case per kind of
 * destination: on premise over HTTP, on premise over RFC (a config with
 * `connection_type: rfc`, e.g. through `MCP_TEST_CONFIG`) and ABAP Cloud.
 * The case of the configured kind runs; the other two skip, saying why.
 * Without a configuration, or with the case disabled, all three skip.
 *
 * What it does, each phase one batch (`HandlerBatch` begin, the calls, end,
 * then the answers by number):
 * 1. reads — `HandlerGet` part metadata of each of the N objects: each
 *    answers `404`, so every name is free (nothing is created otherwise);
 * 2. create — compact `HandlerCreate` × N into the configured package and
 *    transport request;
 * 3. reads — `HandlerGet` part metadata of the domain: the document its write
 *    sends whole;
 * 4. lock — `HandlerLock` × N, the lock handles read from the answers;
 * 5. write — `HandlerUpdate` × N under those handles: the class's and the
 *    interface's sources, the domain's whole document in `source_code`;
 * 6. unlock — `HandlerUnlock` × N;
 * 7. activate — `HandlerActivate` × N, one object each, each answering
 *    `activated: true`;
 * 8. reads — `HandlerGet` × N: the sources and the document as written.
 *
 * Every recorded call answers nothing; `end` answers how many were recorded
 * and which failed; every number's answer is checked on its own.
 *
 * Cleanup, in `finally`, whatever happened: a lock still held is released;
 * `HandlerDeletionCheck` × created objects, then `HandlerDelete` × the ones
 * it permits, each a batch; then a read of each answers `404` — every
 * deletion proven. Then the client ends the server's stdin: the server logs
 * every session off and exits `0`, which the test asserts.
 *
 * Every phase's time (recording and `end`) is written to stderr, one
 * `batch-live` line each.
 *
 * Run (HTTP): npm test -- src/__tests__/integration/batch/communicationBatch.test.ts --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 * Run (RFC):  MCP_TEST_CONFIG=tests/test-config.rfc.yaml with the same command,
 *             the RFC SDK's libraries on LD_LIBRARY_PATH and SAPNWRFC_HOME set.
 */

import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { patchDomainXml } from '../../../lib/strategies/domainPatch';
import {
  assertNotSharedDependency,
  getEnabledTestCase,
  getTimeout,
  loadTestConfig,
  resolvePackageName,
  resolveTransportRequest,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';

const testLogger = createTestLogger('communication-batch');

const REPO = path.resolve(__dirname, '../../../..');
const MARKER = 'batch-communication-live';

type Content = Array<{ type: string; text?: string }>;
type Answer = { content?: Content; isError?: boolean };
type Entry = { number: number; content?: Content; isError?: boolean };

type Kind = 'onprem-http' | 'onprem-rfc' | 'cloud';

const KIND_WORDS: Record<Kind, string> = {
  'onprem-http': 'on premise over HTTP',
  'onprem-rfc': 'on premise over RFC',
  cloud: 'ABAP Cloud',
};

/** The kind of destination the config names, or why there is none. */
function configuredKind(): Kind | { reason: string } {
  let cfg: any;
  try {
    cfg = loadTestConfig();
  } catch (error) {
    return { reason: `the test config cannot be read (${String(error)})` };
  }
  const env = cfg?.environment ?? {};
  if (!env.env) {
    return {
      reason: 'the test config names no session file (environment.env)',
    };
  }
  const system = String(env.system_type ?? '').trim();
  const transport = String(env.connection_type ?? 'http')
    .trim()
    .toLowerCase();
  if (system === 'cloud') {
    return transport === 'rfc'
      ? { reason: 'the config names ABAP Cloud over RFC, which does not exist' }
      : 'cloud';
  }
  if (system === 'onprem' || system === 'legacy') {
    return transport === 'rfc' ? 'onprem-rfc' : 'onprem-http';
  }
  return { reason: 'the test config names no system_type' };
}

/** The text of an answer's first content, parsed; `undefined` when it is not JSON. */
function payloadOf(answer: { content?: Content } | undefined): any {
  const text = answer?.content?.[0]?.text;
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The first value of `key` anywhere in a parsed answer that `accept` takes. */
function fieldIn(
  value: unknown,
  key: string,
  accept: (found: unknown) => boolean,
  depth = 0,
): unknown {
  if (depth > 6 || value === null || typeof value !== 'object')
    return undefined;
  const own = (value as Record<string, unknown>)[key];
  if (accept(own)) return own;
  for (const inner of Object.values(value as Record<string, unknown>)) {
    const found = fieldIn(inner, key, accept, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The first integer `status` anywhere in a parsed answer. */
const statusIn = (value: unknown): number | undefined =>
  fieldIn(
    value,
    'status',
    (found) => typeof found === 'number' && Number.isInteger(found),
  ) as number | undefined;

/** The activation verdict anywhere in a parsed answer. */
const activatedIn = (value: unknown): boolean | undefined =>
  fieldIn(value, 'activated', (found) => typeof found === 'boolean') as
    | boolean
    | undefined;

const textOf = (entry: Entry | undefined): string =>
  (entry?.content ?? []).map((c) => c.text ?? '').join('\n');

/** The served compact server over stdio, and the client calling it. */
type Served = {
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** Ends stdin and waits for the server's own exit; its code. */
  stop(): Promise<number | null>;
  stderrTail(): string;
};

async function serve(kind: Kind): Promise<Served> {
  const cfg = loadTestConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'communication-batch-'));
  const entry = path.join(dir, 'compact-stdio.ts');
  fs.writeFileSync(
    entry,
    [
      `import { main } from ${JSON.stringify(path.join(REPO, 'compact/src/launcher'))};`,
      `import { launcherFailedLine } from ${JSON.stringify(path.join(REPO, 'server/src/launcher'))};`,
      'void main().catch((err) => {',
      '  console.error(launcherFailedLine(err));',
      '  process.exit(1);',
      '});',
      '',
    ].join('\n'),
  );

  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    cfg?.auth_broker?.unsafe === true ||
    cfg?.auth_broker?.unsafe_session_store === true;
  const envName = String(cfg.environment.env);
  const args = [
    path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
    '--tsconfig',
    path.join(REPO, 'tsconfig.test.json'),
    entry,
    ...(useUnsafe ? ['--unsafe'] : []),
  ];
  const brokerPath = testAuthBrokerPath(cfg);
  if (brokerPath) args.push(`--auth-broker-path=${brokerPath}`);
  args.push(
    /[\\/]/.test(envName) || envName.startsWith('.') || envName.startsWith('~')
      ? `--env-path=${path.resolve(envName)}`
      : `--env=${envName}`,
    `--connection-type=${kind === 'onprem-rfc' ? 'rfc' : 'http'}`,
  );

  const env: Record<string, string> = getDefaultEnvironment();
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      name === 'NODE_PATH' ||
      name.startsWith('DEBUG_') ||
      name.startsWith('SAP_DEBUG_') ||
      // RFC: the SDK and the libraries the addon loads.
      name === 'SAPNWRFC_HOME' ||
      name === 'LD_LIBRARY_PATH'
    ) {
      env[name] = value;
    }
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: REPO,
    env,
    stderr: 'pipe',
  });
  const tail: string[] = [];
  transport.stderr?.on('data', (chunk: Buffer) => {
    tail.push(...chunk.toString('utf8').split('\n'));
    if (tail.length > 200) tail.splice(0, tail.length - 200);
  });
  const client = new Client({ name: 'communication-batch', version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `the server did not start (${String(error)}):\n${tail.join('\n')}`,
    );
  }
  const child = (transport as unknown as { _process?: ChildProcess })._process;
  if (child === undefined) throw new Error('the server process did not start');
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  return {
    call: async (name, callArgs = {}) =>
      (await client.callTool({ name, arguments: callArgs })) as Answer,
    stop: async () => {
      // stdin's end is the shutdown's trigger: every session logged off, then exit.
      child.stdin?.end();
      const code = await exited;
      await client.close().catch(() => undefined);
      fs.rmSync(dir, { recursive: true, force: true });
      return code;
    },
    stderrTail: () => tail.join('\n'),
  };
}

type Call = { tool: string; args: Record<string, unknown> };

type Phase = {
  summary: { recorded?: number; failed?: number[]; came?: unknown };
  entries: Entry[];
  recordMs: number;
  endMs: number;
};

/**
 * One phase as one batch: begin, record every call (each answers nothing),
 * end, then read every number's answer. The time of recording and of `end`
 * goes to stderr.
 */
async function phase(
  served: Served,
  kind: Kind,
  label: string,
  calls: Call[],
): Promise<Phase> {
  const begun = payloadOf(
    await served.call('HandlerBatch', { action: 'begin' }),
  );
  expect(begun?.batch).toBe('on');
  const started = process.hrtime.bigint();
  for (const { tool, args } of calls) {
    const recorded = await served.call(tool, args);
    if (recorded.isError === true || (recorded.content ?? []).length > 0) {
      // Not recorded: leave batch mode, then say what came.
      await served.call('HandlerBatch', { action: 'end' });
      throw new Error(
        `${label}: ${tool} was not recorded: ${(recorded.content ?? []).map((c) => c.text).join('\n')}`,
      );
    }
  }
  const recordedAt = process.hrtime.bigint();
  const ended = await served.call('HandlerBatch', { action: 'end' });
  const endedAt = process.hrtime.bigint();
  const summary = payloadOf(ended) ?? {};
  const numbers = calls.map((_, index) => index + 1);
  const entries = (payloadOf(
    await served.call('HandlerBatch', { action: 'answers', numbers }),
  ) ?? []) as Entry[];
  const recordMs = Number(recordedAt - started) / 1e6;
  const endMs = Number(endedAt - recordedAt) / 1e6;
  process.stderr.write(
    `${[
      'batch-live',
      kind,
      label,
      `calls=${calls.length}`,
      `record_ms=${recordMs.toFixed(0)}`,
      `end_ms=${endMs.toFixed(0)}`,
      `failed=${JSON.stringify(summary.failed ?? null)}`,
    ].join('\t')}\n`,
  );
  expect(summary.recorded).toBe(calls.length);
  expect(summary.came).toBeUndefined();
  expect(entries.map((entry) => entry.number)).toEqual(numbers);
  return { summary, entries, recordMs, endMs };
}

/** Every number answered without an error; the failures named otherwise. */
function expectAllAnswered(label: string, calls: Call[], result: Phase): void {
  const failures = result.entries
    .filter((entry) => entry.isError === true)
    .map(
      (entry) =>
        `#${entry.number} ${calls[entry.number - 1]?.tool}: ${textOf(entry).slice(0, 600)}`,
    );
  if (failures.length > 0) {
    throw new Error(`${label}: ${failures.join('\n')}`);
  }
  expect(result.summary.failed).toEqual([]);
}

type TestObject = {
  type: 'CLASS' | 'INTERFACE' | 'DOMAIN';
  name: string;
  /** The create's and the write's name field. */
  field: 'class_name' | 'interface_name' | 'domain_name';
};

const nameArg = (object: TestObject) => ({ [object.field]: object.name });

const metadataRead = (object: TestObject): Call => ({
  tool: 'HandlerGet',
  args: { object_type: object.type, ...nameArg(object), part: 'metadata' },
});

function sourceOf(object: TestObject): string {
  const lower = object.name.toLowerCase();
  if (object.type === 'CLASS') {
    return [
      `CLASS ${lower} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      `    CONSTANTS marker TYPE string VALUE '${MARKER}'.`,
      'ENDCLASS.',
      '',
      `CLASS ${lower} IMPLEMENTATION.`,
      'ENDCLASS.',
      '',
    ].join('\n');
  }
  return [
    `INTERFACE ${lower} PUBLIC.`,
    `  CONSTANTS marker TYPE string VALUE '${MARKER}'.`,
    'ENDINTERFACE.',
    '',
  ].join('\n');
}

async function runOn(kind: Kind, testCase: any): Promise<void> {
  const params = testCase.params ?? {};
  const packageName = resolvePackageName(testCase);
  const transport = resolveTransportRequest(testCase);
  const objects: TestObject[] = [
    {
      type: 'CLASS',
      name: String(params.class_name ?? 'ZMCP_BTC_CLS').toUpperCase(),
      field: 'class_name',
    },
    {
      type: 'INTERFACE',
      name: String(params.interface_name ?? 'ZMCP_BTC_INTF').toUpperCase(),
      field: 'interface_name',
    },
    {
      type: 'DOMAIN',
      name: String(params.domain_name ?? 'ZMCP_BTC_DOM').toUpperCase(),
      field: 'domain_name',
    },
  ];
  for (const object of objects) {
    assertNotSharedDependency(`${object.type}`, object.name);
  }
  const withTransport: Record<string, string> = transport
    ? { transport_request: transport }
    : {};

  const served = await serve(kind);
  /** Objects whose create was sent: the cleanup's. */
  let created: TestObject[] = [];
  /** Lock handles not yet released, by object name. */
  const held = new Map<string, string>();
  let failure: unknown;
  try {
    // 1. Reads: every name is free.
    const freeCalls = objects.map(metadataRead);
    const free = await phase(served, kind, 'reads (names free)', freeCalls);
    for (const entry of free.entries) {
      const object = objects[entry.number - 1] as TestObject;
      if (entry.isError !== true || statusIn(payloadOf(entry)) !== 404) {
        throw new Error(
          `${object.type} ${object.name} is not free (its read answered: ${textOf(entry).slice(0, 300)}); nothing is created`,
        );
      }
    }

    // 2. Create.
    const createCalls = objects.map((object) => ({
      tool: 'HandlerCreate',
      args: {
        object_type: object.type,
        ...nameArg(object),
        package_name: packageName,
        description: `Batch live ${object.type.toLowerCase()}`,
        ...withTransport,
      },
    }));
    created = objects;
    const create = await phase(served, kind, 'create', createCalls);
    created = objects.filter(
      (_, index) => create.entries[index]?.isError !== true,
    );
    expectAllAnswered('create', createCalls, create);

    // 3. Read: the domain's document, sent back whole by its write.
    const domain = objects[2] as TestObject;
    const documentRead = await phase(served, kind, 'reads (domain document)', [
      metadataRead(domain),
    ]);
    expectAllAnswered(
      'reads (domain document)',
      [metadataRead(domain)],
      documentRead,
    );
    const document = payloadOf(documentRead.entries[0])?.metadata;
    expect(typeof document).toBe('string');
    const domainDocument = patchDomainXml(String(document), {
      description: `Batch live domain ${MARKER}`,
      datatype: 'CHAR',
      length: 10,
    });

    // 4. Lock.
    const lockCalls = objects.map((object) => ({
      tool: 'HandlerLock',
      args: { object_type: object.type, object_name: object.name },
    }));
    const lock = await phase(served, kind, 'lock', lockCalls);
    for (const entry of lock.entries) {
      const handle = payloadOf(entry)?.lock_handle;
      if (
        entry.isError !== true &&
        typeof handle === 'string' &&
        handle !== ''
      ) {
        held.set((objects[entry.number - 1] as TestObject).name, handle);
      }
    }
    expectAllAnswered('lock', lockCalls, lock);
    expect(held.size).toBe(objects.length);
    const handleOf = (object: TestObject) => held.get(object.name) as string;

    // 5. Write under the locks.
    const writeCalls = objects.map((object) => ({
      tool: 'HandlerUpdate',
      args: {
        object_type: object.type,
        ...nameArg(object),
        lock_handle: handleOf(object),
        source_code:
          object.type === 'DOMAIN' ? domainDocument : sourceOf(object),
        ...withTransport,
      },
    }));
    const write = await phase(served, kind, 'write', writeCalls);
    expectAllAnswered('write', writeCalls, write);

    // 6. Unlock.
    const unlockCalls = objects.map((object) => ({
      tool: 'HandlerUnlock',
      args: {
        object_type: object.type,
        object_name: object.name,
        lock_handle: handleOf(object),
      },
    }));
    const unlock = await phase(served, kind, 'unlock', unlockCalls);
    for (const entry of unlock.entries) {
      if (entry.isError !== true) {
        held.delete((objects[entry.number - 1] as TestObject).name);
      }
    }
    expectAllAnswered('unlock', unlockCalls, unlock);

    // 7. Activate, one object each.
    const activateCalls = objects.map((object) => ({
      tool: 'HandlerActivate',
      args: { object_type: object.type, object_name: object.name },
    }));
    const activate = await phase(served, kind, 'activate', activateCalls);
    expectAllAnswered('activate', activateCalls, activate);
    for (const entry of activate.entries) {
      const object = objects[entry.number - 1] as TestObject;
      if (activatedIn(payloadOf(entry)) !== true) {
        throw new Error(
          `activate: ${object.type} ${object.name} was not activated: ${textOf(entry).slice(0, 600)}`,
        );
      }
    }

    // 8. Reads: what was written.
    const readCalls = objects.map((object) =>
      object.type === 'DOMAIN'
        ? metadataRead(object)
        : {
            tool: 'HandlerGet',
            args: {
              object_type: object.type,
              ...nameArg(object),
              part: 'source',
            },
          },
    );
    const readBack = await phase(served, kind, 'reads (written)', readCalls);
    expectAllAnswered('reads (written)', readCalls, readBack);
    for (const entry of readBack.entries) {
      const object = objects[entry.number - 1] as TestObject;
      const body = payloadOf(entry);
      if (object.type === 'DOMAIN') {
        expect(String(body?.metadata)).toContain(MARKER);
        expect(String(body?.metadata)).toContain(
          '<doma:datatype>CHAR</doma:datatype>',
        );
      } else {
        expect(String(body?.source)).toContain(MARKER);
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    const problems: string[] = [];
    try {
      await cleanUp(served, kind, created, held, withTransport, problems);
    } catch (error) {
      problems.push(`cleanup: ${String(error)}`);
    }
    const code = await served.stop();
    if (code !== 0) {
      problems.push(
        `the server exited ${code}, not 0: not every session was logged off cleanly.\n${served.stderrTail()}`,
      );
    }
    if (failure !== undefined) {
      if (problems.length > 0) {
        process.stderr.write(
          `communication batch cleanup:\n${problems.join('\n')}\n`,
        );
      }
      throw failure;
    }
    if (problems.length > 0) throw new Error(problems.join('\n'));
  }
}

/**
 * Releases a lock still held, then deletes every created object — deletion
 * check, delete, each a batch — and proves each gone: its read answers 404.
 */
async function cleanUp(
  served: Served,
  kind: Kind,
  created: TestObject[],
  held: Map<string, string>,
  withTransport: Record<string, string>,
  problems: string[],
): Promise<void> {
  for (const object of created) {
    const handle = held.get(object.name);
    if (handle === undefined) continue;
    const answer = await served.call('HandlerUnlock', {
      object_type: object.type,
      object_name: object.name,
      lock_handle: handle,
    });
    if (answer.isError === true) {
      problems.push(
        `unlock of ${object.type} ${object.name}: ${textOf(answer as Entry)}`,
      );
    } else {
      held.delete(object.name);
    }
  }
  if (created.length === 0) return;

  const checkCalls = created.map((object) => ({
    tool: 'HandlerDeletionCheck',
    args: { object_type: object.type, object_name: object.name },
  }));
  const check = await phase(served, kind, 'deletion check', checkCalls);
  const deletable = created.filter((object, index) => {
    const entry = check.entries[index];
    const permitted =
      entry?.isError !== true && payloadOf(entry)?.deletable === true;
    if (!permitted) {
      problems.push(
        `deletion check of ${object.type} ${object.name}: ${textOf(entry).slice(0, 600)}`,
      );
    }
    return permitted;
  });
  if (deletable.length > 0) {
    const deleteCalls = deletable.map((object) => ({
      tool: 'HandlerDelete',
      args: { object_type: object.type, ...nameArg(object), ...withTransport },
    }));
    const removed = await phase(served, kind, 'delete', deleteCalls);
    removed.entries.forEach((entry, index) => {
      if (entry.isError === true) {
        const object = deletable[index] as TestObject;
        problems.push(
          `delete of ${object.type} ${object.name}: ${textOf(entry).slice(0, 600)}`,
        );
      }
    });
  }

  // Every deletion proven: each created object's read answers 404.
  const goneCalls = created.map(metadataRead);
  const gone = await phase(served, kind, 'reads (deleted)', goneCalls);
  gone.entries.forEach((entry, index) => {
    const object = created[index] as TestObject;
    const status = entry.isError === true ? statusIn(payloadOf(entry)) : 200;
    if (status !== 404) {
      problems.push(
        `${object.type} ${object.name} still reads (${status ?? 'no status'}): not deleted`,
      );
    }
  });
}

describe('the communication batch through the served compact tools, on the system the test config names', () => {
  const kinds: Kind[] = ['onprem-http', 'onprem-rfc', 'cloud'];
  for (const kind of kinds) {
    it(
      `${KIND_WORDS[kind]}: reads, create, lock, write, unlock, activate, each a batch; answers per number; every object deleted`,
      async () => {
        const configured = configuredKind();
        if (typeof configured !== 'string') {
          testLogger?.info(
            `⏭️  Skipping ${KIND_WORDS[kind]}: ${configured.reason}`,
          );
          return;
        }
        if (configured !== kind) {
          testLogger?.info(
            `⏭️  Skipping ${KIND_WORDS[kind]}: the test config names ${KIND_WORDS[configured]}; this case runs only there`,
          );
          return;
        }
        const testCase = getEnabledTestCase('batch', 'communication');
        if (!testCase) {
          testLogger?.info(
            `⏭️  Skipping ${KIND_WORDS[kind]}: batch.test_cases.communication is not enabled in the test config`,
          );
          return;
        }
        await runOn(kind, testCase);
      },
      getTimeout('long'),
    );
  }
});
