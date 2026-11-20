/**
 * A fresh connection the host's `freshConnection` factory gives takes the
 * kind of the connection it is fresh for (D26 B2): the long call's own
 * connection, a background run's, the debugger's and a forced-new
 * `DeletePackage`'s all open through `openFreshConnection` on the call's
 * connection, which the server declared its `systemType` on. The fresh one
 * then runs on that kind whatever `SAP_SYSTEM_TYPE` says — unset or another.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { format } from 'node:util';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { resetProcessLatchForTests } from '../../lib/activeTools';
import { systemKindOf } from '../../lib/connectionFactory';
import {
  openFreshConnection,
  registerFreshConnectionFactory,
} from '../../lib/packageSessions';
import { declareSystemKind } from '../../lib/systemKind';

const previous = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => resetProcessLatchForTests());
afterEach(() => {
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** A host's connection: connects and disconnects, sends nothing. */
function hostConnection(): IAbapConnection {
  const connection: Pick<IAbapConnection, 'connect' | 'disconnect'> = {
    connect: async () => {},
    disconnect: async () => {},
  };
  return connection as IAbapConnection;
}

for (const [_label, env] of [
  ['unset', undefined],
  ['cloud', 'cloud'],
] as const) {
  it(
    format(
      'declared onprem, SAP_SYSTEM_TYPE %s: the fresh connection is onprem',
      _label,
    ),
    async () => {
      if (env === undefined) delete process.env.SAP_SYSTEM_TYPE;
      else process.env.SAP_SYSTEM_TYPE = env;
      const main = hostConnection();
      declareSystemKind(main, 'onprem');
      registerFreshConnectionFactory(main, async () => hostConnection());
      const fresh = await openFreshConnection(main, silent);
      assert.equal(systemKindOf(fresh), 'onprem');
    },
  );
}
