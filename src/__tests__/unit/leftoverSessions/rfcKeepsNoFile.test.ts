/**
 * RFC connections keep no runtime file: an RFC
 * session is its conversation and cannot be picked up by another process.
 * The connection here answers a session cookie whatever its wire, so only
 * the settings' `connectionType` decides: `http` writes a file, `rfc` none.
 * An instance that serves no destination keeps none either: the
 * destination is who its leftover sessions belong to.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, it, mock } from 'node:test';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import * as connectionFactory from '../../../lib/connectionFactory';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { LeftoverSessions } from '../../../lib/leftoverSessions/LeftoverSessions';
import { probeGroup } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';
import { fakeProbe, OUR_PID } from './harness';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// The real exports, read before any is replaced.
const actual = { ...connectionFactory };

mock.method(connectionFactory, 'createAbapConnection', () => ({
  connect: async () => {},
  disconnect: async () => {},
  isConnected: () => true,
  makeAdtRequest: async () => ({ status: 200, data: '' }),
  sessionCookies: () => 'SAP_SESSIONID_X01_100=placeholder-session',
}));

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

class Server extends BaseMcpServer {
  constructor(
    owner: LeftoverSessions,
    settings: SapConfig,
    destination: string | undefined,
  ) {
    super({
      name: 'rfc-no-file',
      leftoverSessions: owner,
      logger: { info() {}, debug() {}, warn() {}, error() {} },
    });
    const source = { settings, credential: {} as IAuthProvider };
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => source },
      ...(destination !== undefined ? { destination } : {}),
    });
    this.registerHandlers(new CompositeHandlersRegistry([probeGroup()]));
  }
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-rfc-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function filesAfterACall(
  connectionType: 'http' | 'rfc',
  destination: string | null = 'PLACEHOLDER_DEST',
) {
  const owner = new LeftoverSessions({
    directory: dir,
    probe: fakeProbe(OUR_PID, new Set()),
  });
  const server = new Server(
    owner,
    connectionType === 'rfc'
      ? {
          client: '100',
          language: 'EN',
          ashost: 'placeholder.invalid',
          sysnr: '00',
          authType: 'basic',
          username: 'PLACEHOLDER_USER',
          connectionType,
        }
      : {
          url: 'http://placeholder.invalid',
          client: '100',
          authType: 'basic',
          username: 'PLACEHOLDER_USER',
          connectionType,
        },
    destination ?? undefined,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'rfc', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  await client.callTool({ name: 'ProbeAdt', arguments: { id: 'one' } });
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  await client.close();
  await server.terminalClose();
  return files;
}

it('an HTTP connection holding a session writes its file (the control)', async () => {
  assert.equal((await filesAfterACall('http')).length, 1);
});

it('an RFC connection writes none', async () => {
  assert.deepStrictEqual(await filesAfterACall('rfc'), []);
});

it('an instance that serves no destination writes none', async () => {
  assert.deepStrictEqual(await filesAfterACall('http', null), []);
});
