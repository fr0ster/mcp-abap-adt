/**
 * Leftover sessions on stdio (session-resume spec): core's server takes the
 * launcher's owner. The destination's connection keeps a runtime file
 * while it holds the session, deleted once its logoff is written at the
 * instance's close; the leftover-session tools answer for the destination's
 * user. In inspection-only mode (no destination) they answer the
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
} from '../../../src/__tests__/helpers/adtStandIn';
import {
  fakeProbe,
  killedProcessSession,
  runtimeFiles,
} from '../../../src/__tests__/helpers/leftoverSession';
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

async function serve(withDestination: boolean) {
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
  return { server, client, call };
}

it("the destination's connection keeps its file until its logoff is written", async () => {
  const { server, client, call } = await serve(true);
  expect((await call('ProbeAdt', { id: 'one' })).isError).toBe(false);
  expect(runtimeFiles(dir)).toHaveLength(1);
  await client.close();
  await server.terminalClose();
  expect(runtimeFiles(dir)).toEqual([]);
});

it("lists and resumes the destination user's leftover session", async () => {
  const handle = await killedProcessSession(standIn.url, dir, {
    user: 'CORE_USER',
  });
  const { server, client, call } = await serve(true);
  const listed = JSON.parse((await call('ListLeftoverSessions')).text)
    .sessions as Array<{ handle: string }>;
  expect(listed.map((s) => s.handle)).toEqual([handle]);
  expect(
    JSON.parse((await call('ResumeLeftoverSession', { handle })).text),
  ).toEqual({ handle, state: 'resumed' });
  await client.close();
  await server.terminalClose();
  expect(runtimeFiles(dir)).toEqual([]);
});

it('inspection-only mode refuses the tools in its own words', async () => {
  const { client, call } = await serve(false);
  const answer = await call('ListLeftoverSessions');
  expect(answer.isError).toBe(true);
  expect(JSON.parse(answer.text).error).toBe('inspection_only');
  await client.close();
});
