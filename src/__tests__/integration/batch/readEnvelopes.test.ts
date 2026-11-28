/**
 * The read envelopes through the served core tools (#392, spec §9.9), on the
 * configured system.
 *
 * Hard mode: the test starts the core server over stdio — the stdio
 * launcher's `main` with `fullToolSet` (`server-runtime/src/stdio/launcher.ts`),
 * run from source through tsx with `tsconfig.test.json`'s package paths — and
 * calls its tools by name through an MCP client, as a model does.
 *
 * Where it runs: the system the config names, when the case
 * `batch.test_cases.read_envelopes` is in the test config (its data; its
 * `enabled` is not read) — one case per kind of destination: on premise over
 * HTTP, on premise over RFC, ABAP Cloud. The case of the configured kind runs;
 * the other two skip, saying why. Without a configuration or the case, all
 * three skip.
 *
 * What it does, once without a bound and once with
 * `--batch-parts-per-envelope=2`: one envelope holding a group A read of each
 * shared object the config names and the system serves (`shared_dependencies`:
 * the first table, structure, CDS view, behavior definition, class, function
 * group, function module (its metadata), service definition, domain, data
 * element, interface, program, metadata extension); executed; each number's
 * answer compared with the same read made without an envelope. A second
 * envelope is listed beside it and discarded. It only reads.
 *
 * Run (HTTP): npm run test:integration -- src/__tests__/integration/batch/readEnvelopes.test.ts
 * Run (RFC):  MCP_TEST_CONFIG=tests/test-config.rfc.yaml with the same command,
 *             the RFC SDK's libraries on LD_LIBRARY_PATH and SAPNWRFC_HOME set.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { repositoryRoot } from '../../helpers/repoRoot';
import {
  getTestCase,
  loadTestConfig,
  testAuthBrokerPath,
} from '../helpers/configHelpers';
import { stderrTail } from '../helpers/failureText';
import { assertEquals } from '../helpers/liveAssert';
import { skipRunningTest } from '../helpers/runningTest';
import {
  launchStdioScript,
  testConnectionLogOn,
} from '../helpers/testers/hardMode';

const REPO = repositoryRoot(__dirname);

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

function payloadOf(answer: { content?: Content } | undefined): any {
  const text = answer?.content?.[0]?.text;
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type Served = {
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  stop(): Promise<number | null>;
  stderrTail(): string;
};

/** The core server over stdio, `extra` its further arguments. */
async function serve(kind: Kind, extra: string[]): Promise<Served> {
  const cfg = loadTestConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-envelopes-'));
  const entry = path.join(dir, 'full-stdio.ts');
  fs.writeFileSync(
    entry,
    [
      `import { main, launcherFailedLine } from ${JSON.stringify(path.join(REPO, 'server-runtime/src/stdio/launcher'))};`,
      `import { CORE_VERSION } from ${JSON.stringify(path.join(REPO, 'server/src/coreVersion'))};`,
      `import { fullToolSet } from ${JSON.stringify(path.join(REPO, 'src/lib/toolSet'))};`,
      "void main({ toolSet: fullToolSet, program: 'mcp-abap-adt', version: CORE_VERSION }).catch((err) => {",
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
  const envName = String(cfg.environment?.env);
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
    `--system-type=${kind === 'cloud' ? 'cloud' : 'onprem'}`,
    `--connection-type=${kind === 'onprem-rfc' ? 'rfc' : 'http'}`,
    ...extra,
  );
  const env: Record<string, string> = getDefaultEnvironment();
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      name === 'NODE_PATH' ||
      name.startsWith('DEBUG_') ||
      name === 'SAPNWRFC_HOME' ||
      name === 'LD_LIBRARY_PATH'
    ) {
      env[name] = value;
    }
  }
  let server: Awaited<ReturnType<typeof launchStdioScript>>;
  try {
    server = await launchStdioScript({
      argv: [args[0] ?? '', ...args.slice(1)],
      env,
      logOn: testConnectionLogOn,
    });
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`the server did not start: ${String(error)}`);
  }
  const child = server.child;
  if (child === undefined) throw new Error('the server process did not start');
  const tail = stderrTail(child);
  return {
    call: (name, callArgs = {}) => server.call(name, callArgs),
    stop: async () => {
      const code = await child.end();
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
      return code;
    },
    stderrTail: () => tail.text(),
  };
}

type Read = { tool: string; args: Record<string, unknown> };

/** The first shared object of `key` the system kind serves: its entry, or none. */
function firstShared(cfg: any, key: string, system: string): any {
  const list: any[] = cfg?.shared_dependencies?.[key] ?? [];
  return list.find(
    (item) =>
      item?.name &&
      (item.available_in === undefined ||
        (Array.isArray(item.available_in) &&
          item.available_in.includes(system))),
  );
}

/** One group A read of each shared object the config names and the system serves. */
function readsOf(kind: Kind): Read[] {
  const cfg = loadTestConfig();
  const system = kind === 'cloud' ? 'cloud' : 'onprem';
  const reads: Read[] = [];
  const add = (key: string, read: (item: any) => Read) => {
    const item = firstShared(cfg, key, system);
    if (item !== undefined) reads.push(read(item));
  };
  add('tables', (t) => ({ tool: 'GetTable', args: { table_name: t.name } }));
  add('structures', (t) => ({
    tool: 'GetStructure',
    args: { structure_name: t.name },
  }));
  add('views', (t) => ({ tool: 'GetDdl', args: { ddl_name: t.name } }));
  add('behavior_definitions', (t) => ({
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: t.name },
  }));
  add('classes', (t) => ({ tool: 'GetClass', args: { class_name: t.name } }));
  add('classes', (t) => ({
    tool: 'GetClass',
    args: { class_name: t.name, part: 'metadata' },
  }));
  add('function_groups', (t) => ({
    tool: 'GetFunctionGroup',
    args: { function_group_name: t.name },
  }));
  add('function_modules', (t) => ({
    tool: 'GetFunctionModule',
    args: {
      function_module_name: t.name,
      function_group_name: t.group,
      part: 'metadata',
    },
  }));
  add('service_definitions', (t) => ({
    tool: 'GetServiceDefinition',
    args: { service_definition_name: t.name },
  }));
  add('domains', (t) => ({ tool: 'GetDomain', args: { domain_name: t.name } }));
  add('data_elements', (t) => ({
    tool: 'GetDataElement',
    args: { data_element_name: t.name },
  }));
  add('interfaces', (t) => ({
    tool: 'GetInterface',
    args: { interface_name: t.name },
  }));
  add('programs', (t) => ({
    tool: 'GetProgram',
    args: { program_name: t.name },
  }));
  add('metadata_extensions', (t) => ({
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: t.name },
  }));
  return reads;
}

/** One run: the reads directly, then in one envelope; every answer the same. */
async function runOn(kind: Kind, bound: number | undefined): Promise<void> {
  const reads = readsOf(kind);
  assert.ok(reads.length > 0, 'the config names no shared object to read');
  const served = await serve(
    kind,
    bound === undefined ? [] : [`--batch-parts-per-envelope=${bound}`],
  );
  let failure: unknown;
  try {
    const direct: Answer[] = [];
    for (const read of reads)
      direct.push(await served.call(read.tool, read.args));
    const created = payloadOf(await served.call('CreateReadEnvelope'));
    const handle = created?.envelope_handle;
    assert.equal(typeof handle, 'string', 'CreateReadEnvelope gave no handle');
    // A second envelope, listed beside the first and discarded: nothing sent.
    const other = payloadOf(
      await served.call('CreateReadEnvelope'),
    )?.envelope_handle;
    assertEquals(payloadOf(await served.call('ListReadEnvelopes')), [
      { envelope_handle: handle, recorded: 0 },
      { envelope_handle: other, recorded: 0 },
    ]);
    assertEquals(
      payloadOf(
        await served.call('DiscardReadEnvelope', { envelope_handle: other }),
      ),
      { envelope_handle: other, discarded: 0 },
    );
    for (const [index, read] of reads.entries()) {
      const recorded = await served.call(read.tool, {
        ...read.args,
        envelope_handle: handle,
      });
      assertEquals(payloadOf(recorded), {
        envelope_handle: handle,
        number: index + 1,
      });
    }
    const started = process.hrtime.bigint();
    const executed = await served.call('ExecuteReadEnvelope', {
      envelope_handle: handle,
    });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    process.stderr.write(
      `envelope-live\t${kind}\tbound=${bound ?? 'none'}\treads=${reads.length}\texecute_ms=${ms.toFixed(0)}\n`,
    );
    assert.notEqual(executed.isError, true, JSON.stringify(executed));
    const entries = (payloadOf(executed) ?? []) as Entry[];
    assertEquals(
      entries.map((entry) => entry.number),
      reads.map((_, index) => index + 1),
    );
    const differing: string[] = [];
    entries.forEach((entry, index) => {
      const read = reads[index] as Read;
      const outside = direct[index] as Answer;
      const same =
        JSON.stringify(entry.content) === JSON.stringify(outside.content) &&
        (entry.isError === true) === (outside.isError === true);
      if (!same) {
        differing.push(
          `${read.tool} ${JSON.stringify(read.args)}: in the envelope ${JSON.stringify(entry).slice(0, 400)}; outside ${JSON.stringify(outside).slice(0, 400)}`,
        );
      }
    });
    assertEquals(differing, []);
    // Ended: the handle names nothing now.
    const again = await served.call('ExecuteReadEnvelope', {
      envelope_handle: handle,
    });
    assert.equal(payloadOf(again)?.error, 'envelope_unavailable');
  } catch (error) {
    failure = error;
  }
  const code = await served.stop();
  if (failure !== undefined) {
    throw Object.assign(
      new Error(`${String(failure)}\n${served.stderrTail()}`),
      { cause: failure },
    );
  }
  assert.equal(code, 0, served.stderrTail());
}

describe('the read envelopes through the served core tools, on the system the test config names', () => {
  const kinds: Kind[] = ['onprem-http', 'onprem-rfc', 'cloud'];
  for (const kind of kinds) {
    for (const bound of [undefined, 2]) {
      it(`${KIND_WORDS[kind]}, ${bound === undefined ? 'no bound' : `a bound of ${bound} parts`}: one envelope of reads, each answer as outside it`, async () => {
        const configured = configuredKind();
        if (typeof configured !== 'string') {
          skipRunningTest(`${KIND_WORDS[kind]}: ${configured.reason}`);
          return;
        }
        if (configured !== kind) {
          skipRunningTest(
            `${KIND_WORDS[kind]}: the test config names ${KIND_WORDS[configured]}; this case runs only there`,
          );
          return;
        }
        if (!getTestCase('batch', 'read_envelopes')) {
          skipRunningTest(
            `${KIND_WORDS[kind]}: the test config has no batch.test_cases[name=read_envelopes]`,
          );
          return;
        }
        await runOn(kind, bound);
      });
    }
  }
});
