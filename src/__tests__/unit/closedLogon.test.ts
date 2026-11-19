/**
 * `BaseMcpServer.getConnection` on an instance whose close lands while the
 * logon's `connect()` runs: the caller gets the closed-instance refusal —
 * whether the connect then resolves or rejects (connection 17 rejects a
 * connect whose teardown was requested in flight) — never the connect's own
 * error and never a connection whose session is gone. One logoff.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import {
  ClosedInstanceRefusal,
  isClosedInstanceRefusal,
} from '../../lib/auth/failures';
import * as connectionFactory from '../../lib/connectionFactory';
import { closeInstance } from '../../lib/instanceClose';
import { rejectionOf } from '../helpers/assertions';

interface Held extends IAbapConnection {
  connects: number;
  disconnects: number;
  release: () => void;
  rejectAfter: boolean;
}

const built: Held[] = [];
let rejectNext = false;

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time), as the Jest factory
// did; the names it left out stay real.
// Every case restores every mock after it: they are replaced before each.
beforeEach(() => {
  // The real exports, read before any is replaced.
  const actual = { ...connectionFactory };

  mock.method(connectionFactory, 'createAbapConnection', () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const connection = {
      connects: 0,
      disconnects: 0,
      release: () => release(),
      rejectAfter: rejectNext,
      async connect() {
        connection.connects += 1;
        await gate;
        if (connection.rejectAfter) throw new Error('connect abandoned');
      },
      async disconnect() {
        connection.disconnects += 1;
      },
    } as unknown as Held;
    built.push(connection);
    return connection;
  });
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const SETTINGS: SapConfig = {
  authType: 'basic',
  username: 'placeholder-user',
  password: 'placeholder-password',
  connectionType: 'rfc',
  client: '100',
  language: 'EN',
  ashost: 'system.invalid',
  sysnr: '00',
};
const ok = async () => ({ ok: true as const });
const credential: IAuthProvider = {
  kind: 'test',
  prepare: ok,
  establish: ok,
  authorize: ok,
  rejected: ok,
};

class Server extends BaseMcpServer {
  constructor() {
    super({
      name: 'closed',
      systemType: 'onprem',
      logger: silent,
      stateLogger: { error() {} },
    });
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => ({ settings: SETTINGS, credential }) },
    });
  }
  connection(): Promise<IAbapConnection> {
    return this.getConnection(new AbortController().signal);
  }
}

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  built.splice(0);
  rejectNext = false;
  mock.method(process.stderr, 'write', () => true);
});
afterEach(() => mock.restoreAll());

it('the close lands while connect runs, and connect then resolves: refused, one logoff', async () => {
  const server = new Server();
  const logon = server.connection();
  const refused = rejectionOf(logon);
  await turns();
  assert.equal(built[0]?.connects, 1);
  await closeInstance(server);
  built[0]?.release();
  assert.ok((await refused) instanceof ClosedInstanceRefusal);
  assert.equal(built[0]?.disconnects, 1);
});

it('the close lands while connect runs, and connect then rejects: the refusal, not the connect error; one logoff', async () => {
  rejectNext = true;
  const server = new Server();
  let thrown: unknown;
  const logon = server.connection().catch((error) => {
    thrown = error;
  });
  await turns();
  await closeInstance(server);
  built[0]?.release();
  await logon;
  assert.equal(isClosedInstanceRefusal(thrown), true);
  assert.equal(built[0]?.disconnects, 1);
});
