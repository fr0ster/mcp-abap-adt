/**
 * Leftover sessions on stdio: core's server takes the
 * launcher's owner. The destination's connection keeps a runtime file
 * while it holds the session, deleted once its logoff is written at the
 * instance's close; the leftover-session tools answer for the destination —
 * on stdio who calls is the destination the process serves — read from the
 * files and the destination alone, without a request to SAP. The resume is
 * the destination's connection's birth at the start (`connectAtStart`): the
 * one leftover session of the destination, before the transport opens. In
 * inspection-only mode (no destination) the tools answer the
 * inspection-only refusal before anything is read.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { LeftoverSessions } from '@mcp-abap-adt/lib/embeddable';
import {
  CompositeHandlersRegistry,
  leftoverSessionEntries,
} from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
} from '../../../../src/__tests__/helpers/adtStandIn';
import {
  fakeProbe,
  killedProcessSession,
  runtimeFiles,
} from '../../../../src/__tests__/helpers/leftoverSession';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { StdioServer } from '../StdioServer.js';

jest.setTimeout(30_000);

let root: string;
let dir: string;
let standIn: AdtStandIn;

beforeEach(async () => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-core-'));
  dir = path.join(root, 'runtime');
  standIn = await adtStandIn();
});

afterEach(async () => {
  await standIn.close();
  fs.rmSync(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const registry = () =>
  new CompositeHandlersRegistry([probeGroup(leftoverSessionEntries())]);

async function serve(withDestination: boolean, atStart = false) {
  const settings: SapConfig = {
    url: standIn.url,
    client: '100',
    authType: 'basic',
    username: 'CORE_USER',
  };
  const credential = new BasicAuthProvider('CORE_USER', 'core-password');
  const destinations = {
    settingsFor: async () => settings,
    getProvider: async () => credential,
  } as unknown as IDestinations;
  const server = new StdioServer(
    registry(),
    withDestination ? destinations : undefined,
    {
      leftoverSessions: new LeftoverSessions({
        directory: dir,
        probe: fakeProbe(222),
        report: () => {},
      }),
    },
  );
  const started =
    withDestination && atStart
      ? await server.connectAtStart('dest')
      : undefined;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'leftover-core', version: '1.0.0' });
  await Promise.all([
    server.start(withDestination ? 'dest' : undefined, serverSide),
    client.connect(clientSide),
  ]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    return { text: answer.content[0]?.text ?? '', isError: !!answer.isError };
  };
  return { server, client, call, started };
}

it("the destination's connection keeps its file until its logoff is written", async () => {
  const { server, client, call } = await serve(true);
  expect((await call('ProbeAdt', { id: 'one' })).isError).toBe(false);
  expect(runtimeFiles(dir)).toHaveLength(1);
  await client.close();
  await server.terminalClose();
  expect(runtimeFiles(dir)).toEqual([]);
});

it("the start takes up the destination's one leftover session; another destination's stays listed for it, and nothing is asked of SAP to list", async () => {
  const handle = await killedProcessSession(standIn.url, dir, {
    user: 'CORE_USER',
    destination: 'dest',
  });
  // The same system under another destination's name: not this caller's.
  const other = await killedProcessSession(standIn.url, dir, {
    user: 'CORE_USER',
    destination: 'other',
  });
  const { server, client, call, started } = await serve(true, true);
  expect(started).toEqual({ session: 'picked_up', handle });
  const from = standIn.requests.length;
  // Taken up: this process's now, not listed.
  const listed = JSON.parse((await call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed).toEqual([]);
  expect(standIn.requests.length).toBe(from);
  expect(runtimeFiles(dir)).toContain(other);
  expect(runtimeFiles(dir)).toContain(handle);
  await client.close();
  await server.terminalClose();
  expect(runtimeFiles(dir)).toEqual([other]);
});

it('inspection-only mode refuses the tools in its own words', async () => {
  const { client, call } = await serve(false);
  const answer = await call('ListLeftoverSessions');
  expect(answer.isError).toBe(true);
  expect(JSON.parse(answer.text).error).toBe('inspection_only');
  await client.close();
});
