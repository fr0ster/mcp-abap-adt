/**
 * DeletePackage takes no connection of its own from the caller: a fresh session
 * is opened from the connection that is there.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  handleDeletePackage,
  TOOL_DEFINITION,
} from '../../handlers/package/high/handleDeletePackage';
import * as answerModule from '../../lib/answer';
import * as clients from '../../lib/clients';
import * as packageSessions from '../../lib/packageSessions';
import { assertNoProperty } from '../helpers/assertions';
import { listedJson } from '../helpers/listedJson';

// The names replaced on the modules that define them (the handler reads them
// at call time); every other name of those modules stays real.
const openFreshConnection = mock.method(
  packageSessions,
  'openFreshConnection',
  () => undefined,
);
const closeQuietly = mock.method(
  packageSessions,
  'closeQuietly',
  async () => {},
);
mock.method(clients, 'createAdtClient', () => ({
  getPackage: () => ({
    // The deletion check permits (19.0.0: DeletePackage asks it first).
    checkDeletion: async () => ({
      ok: true,
      getResult: () => ({ value: { raw: '' } }),
    }),
    delete: async () => ({}),
  }),
}));
mock.method(
  answerModule,
  'answer',
  async (_o: unknown, run: () => Promise<unknown>) => run(),
);

describe('DeletePackage input', () => {
  it('has no connection_config, and still has force_new_connection', () => {
    const properties = listedJson(TOOL_DEFINITION.inputSchema).properties;
    assertNoProperty(properties, 'connection_config');
    assert.ok('force_new_connection' in Object(properties));
  });

  it('opens the fresh connection through openFreshConnection(connection, logger)', async () => {
    const fresh = { id: 'fresh' };
    openFreshConnection.mock.mockImplementation(async () => fresh as never);
    const connection = { id: 'caller' } as any;
    const logger = { info: mock.fn(), warn: mock.fn() } as any;

    await handleDeletePackage({ connection, logger } as any, {
      package_name: 'p',
      force_new_connection: true,
    });

    assert.equal(openFreshConnection.mock.callCount(), 1);
    assert.deepStrictEqual(openFreshConnection.mock.calls[0]?.arguments, [
      connection,
      logger,
    ]);
    assert.ok(closeQuietly.mock.callCount() > 0);
  });
});
