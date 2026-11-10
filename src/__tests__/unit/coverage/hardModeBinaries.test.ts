/**
 * Hard mode starts the real binaries (plan C2 Step 4c), from the build
 * (`npm run build` first), against the ADT stand-in — nothing reaches SAP.
 *
 * Per transport (stdio, Streamable HTTP), set (full, compact) and kind
 * (`--system-type=onprem`, `--system-type=cloud`): the child is ready by its
 * own answer, its complete `tools/list` — every tool's name and listed
 * schema — equals the projection of `listed-schemas.json` for that binary
 * and kind (the data tools among them: hard mode starts every child with
 * `--enable-data-tools`), and a tool call reaches the stand carrying the destination's
 * credential (stdio: its session file; HTTP: the request's headers). Each
 * child is stopped by `SIGTERM` and its exit awaited.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { type AdtStandIn, adtStandIn, basicOf } from '../../helpers/adtStandIn';
import { repositoryRoot } from '../../helpers/repoRoot';
import type { SystemKind } from '../../helpers/servedTools';
import { assertEquals } from '../../integration/helpers/liveAssert';
import { endTestConnection } from '../../integration/helpers/openConnections';
import { guardedTestConnection } from '../../integration/helpers/refusalGuard';
import {
  createHardModeClient,
  type HardModeClient,
  type HardModeSet,
  launchHttp,
  launchStdio,
} from '../../integration/helpers/testers/hardMode';

const REPO = repositoryRoot(__dirname);
const USER = 'HARD_USER';
const PASSWORD = 'hard-password';

/** The binary each transport and set start, as `listed-schemas.json` names it. */
const COMMANDS: Record<'stdio' | 'http', Record<HardModeSet, string>> = {
  stdio: { full: 'mcp-abap-adt', compact: 'mcp-abap-adt-compact' },
  http: { full: 'mcp-abap-adt-http', compact: 'mcp-abap-adt-compact-http' },
};

/** The tool each set's check calls, with arguments every kind serves. */
const CALLS: Record<
  HardModeSet,
  { name: string; args: Record<string, unknown> }
> = {
  full: { name: 'GetAdtTypes', args: {} },
  compact: {
    name: 'HandlerGet',
    args: { object_type: 'CLASS', class_name: 'ZCL_HARD_PROBE' },
  },
};

/** `listed-schemas.json`'s tools for one binary on one kind: name → schema. */
function projection(command: string, kind: SystemKind): Map<string, unknown> {
  const listed: unknown = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'tests', 'fixtures', 'tools', 'listed-schemas.json'),
      'utf8',
    ),
  );
  const schemas: unknown =
    typeof listed === 'object' && listed !== null
      ? Reflect.get(listed, 'schemas')
      : undefined;
  const out = new Map<string, unknown>();
  if (typeof schemas !== 'object' || schemas === null) return out;
  for (const [tool, variants] of Object.entries(schemas)) {
    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      const by: unknown = Reflect.get(variant, 'listedBy');
      if (Array.isArray(by) && by.includes(`${kind} ${command}`)) {
        out.set(tool, Reflect.get(variant, 'value'));
      }
    }
  }
  return out;
}

let stand: AdtStandIn;
let base: string;
let envFile: string;
let runDir: string;

/** The parent's own logon before each launch, with the destination's credential. */
const logOn = async (): Promise<void> => {
  const own = guardedTestConnection(
    { url: stand.url, client: '100', authType: 'basic', username: USER },
    new BasicAuthProvider(USER, PASSWORD),
    { kind: 'onprem' },
  );
  await own.connect();
  await endTestConnection(own);
};

before(async () => {
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-mode-run-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  stand = await adtStandIn();
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-mode-binaries-'));
  envFile = path.join(base, 'stand.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${stand.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_CONNECTION_TYPE=http',
      `SAP_USERNAME=${USER}`,
      `SAP_PASSWORD=${PASSWORD}`,
      '',
    ].join('\n'),
  );
});

after(async () => {
  await stand.close();
  delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.rmSync(base, { recursive: true, force: true });
});

/** The child's listing against the fixture's, then a call reaching the stand. */
async function check(
  launched: HardModeClient,
  command: string,
  kind: SystemKind,
  set: HardModeSet,
): Promise<void> {
  try {
    const listing = await launched.listTools();
    const served = new Map(
      listing.map((tool) => [tool.name, tool.inputSchema]),
    );
    const expected = projection(command, kind);
    assert.ok(expected.size > 0);
    assertEquals([...served.keys()].sort(), [...expected.keys()].sort());
    for (const [name, schema] of expected) {
      assertEquals({ name, schema: served.get(name) }, { name, schema });
    }
    const from = stand.requests.length;
    await launched.call(CALLS[set].name, CALLS[set].args);
    const sent = stand.requests.slice(from);
    assert.ok(sent.length > 0);
    assert.ok(
      sent.filter((r) => r.authorization === basicOf(USER, PASSWORD)).length >
        0,
    );
  } finally {
    await launched.close();
    const child = launched.child;
    // The child has ended: an exit code or the signal that ended it.
    const ended = child?.process.exitCode ?? child?.process.signalCode;
    assert.ok(ended !== null && ended !== undefined);
  }
}

const KINDS: readonly SystemKind[] = ['onprem', 'cloud'];

for (const kind of KINDS) {
  describe(`--system-type=${kind}`, () => {
    it('the stdio binary answers initialize and a tool call reaches the stand', async () => {
      const launched = await launchStdio({
        set: 'full',
        kind,
        args: [`--env-path=${envFile}`, `--auth-broker-path=${base}`],
        logOn,
      });
      await check(launched, COMMANDS.stdio.full, kind, 'full');
    });

    it('the HTTP binary prints its listening line and an authenticated request reaches the stand', async () => {
      const launched = await launchHttp({
        set: 'full',
        kind,
        headers: {
          'x-sap-url': stand.url,
          'x-sap-client': '100',
          'x-sap-login': USER,
          'x-sap-password': PASSWORD,
        },
        logOn,
      });
      assert.ok(
        launched.child
          ?.stderr()
          .includes('[StreamableHttpServer] Server started on 127.0.0.1:'),
      );
      await check(launched, COMMANDS.http.full, kind, 'full');
    });

    it('the compact stdio binary answers initialize and a HandlerGet call reaches the stand', async () => {
      const launched = await launchStdio({
        set: 'compact',
        kind,
        args: [`--env-path=${envFile}`, `--auth-broker-path=${base}`],
        logOn,
      });
      await check(launched, COMMANDS.stdio.compact, kind, 'compact');
    });

    it('the compact HTTP binary prints its listening line and a header-authenticated HandlerGet call reaches the stand', async () => {
      const launched = await launchHttp({
        set: 'compact',
        kind,
        headers: {
          'x-sap-url': stand.url,
          'x-sap-client': '100',
          'x-sap-login': USER,
          'x-sap-password': PASSWORD,
        },
        logOn,
      });
      assert.ok(
        launched.child
          ?.stderr()
          .includes('[StreamableHttpServer] Server started on 127.0.0.1:'),
      );
      await check(launched, COMMANDS.http.compact, kind, 'compact');
    });
  });
}

it('an HTTP child without a system kind is not started by hard mode', async () => {
  fs.mkdirSync(path.join(base, 'sessions'), { recursive: true });
  fs.copyFileSync(envFile, path.join(base, 'sessions', 'STAND.env'));
  const config = {
    auth_broker: {
      paths: { service_keys_dir: base },
      abap: { destination: 'STAND' },
    },
    environment: {},
    integration_hard_mode: {
      enabled: true,
      transport: 'http',
      launch_http: true,
    },
  };
  const saved = process.env.SAP_SYSTEM_TYPE;
  delete process.env.SAP_SYSTEM_TYPE;
  const from = stand.requests.length;
  try {
    await assert.rejects(
      createHardModeClient('full', config),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          'hard mode launches nothing: no system kind stated',
        ),
    );
  } finally {
    if (saved !== undefined) process.env.SAP_SYSTEM_TYPE = saved;
  }
  assert.equal(stand.requests.length, from);
});
