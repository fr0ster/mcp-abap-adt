/**
 * `BaseMcpServer.getConnection` on an instance whose close lands while the
 * logon's `connect()` runs: the caller gets the closed-instance refusal —
 * whether the connect then resolves or rejects (connection 17 rejects a
 * connect whose teardown was requested in flight) — never the connect's own
 * error and never a connection whose session is gone. One logoff.
 */

import type { AbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

interface Held extends IAbapConnection {
  connects: number;
  disconnects: number;
  release: () => void;
  rejectAfter: boolean;
}

const built: Held[] = [];
let rejectNext = false;
jest.mock('../../lib/connectionFactory', () => {
  const actual = jest.requireActual('../../lib/connectionFactory');
  return {
    ...actual,
    createAbapConnection: () => {
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
    },
  };
});

import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import {
  ClosedInstanceRefusal,
  isClosedInstanceRefusal,
} from '../../lib/auth/failures';
import { closeInstance } from '../../lib/instanceClose';

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const SETTINGS: SapConfig = {
  url: 'https://system.invalid',
  authType: 'basic',
  username: 'placeholder-user',
  password: 'placeholder-password',
  connectionType: 'rfc',
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
    super({ name: 'closed', logger: silent, stateLogger: { error() {} } });
    this.setConnectionContext({
      kind: 'built',
      sessionId: 's',
      source: { resolve: async () => ({ settings: SETTINGS, credential }) },
    });
  }
  connection(): Promise<AbapConnection> {
    return this.getConnection(new AbortController().signal);
  }
}

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  built.splice(0);
  rejectNext = false;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => jest.restoreAllMocks());

it('the close lands while connect runs, and connect then resolves: refused, one logoff', async () => {
  const server = new Server();
  const logon = server.connection();
  const refused = expect(logon).rejects.toBeInstanceOf(ClosedInstanceRefusal);
  await turns();
  expect(built[0]?.connects).toBe(1);
  await closeInstance(server);
  built[0]?.release();
  await refused;
  expect(built[0]?.disconnects).toBe(1);
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
  expect(isClosedInstanceRefusal(thrown)).toBe(true);
  expect(built[0]?.disconnects).toBe(1);
});
