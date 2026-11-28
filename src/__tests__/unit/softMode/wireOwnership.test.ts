/**
 * Lock ownership at the wire (#394, second review): a soft-mode run
 * connection's registry sees every LOCK and UNLOCK the connection sends,
 * whoever sent it — a suite, a handler's own `withLock`, the in-process
 * server — so no path can take a handle the registry does not know. A
 * session the connection lost clears that connection's locks only: a
 * package delete's sibling losing its session clears nothing of the run's.
 * A lock only the wire saw is released by the cleanup with its own UNLOCK,
 * once.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { handleHandlerLock } from '../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { setSystemContext } from '../../helpers/processSystemContext';
import { installSocketCut, type SocketCut } from '../../helpers/socketCut';
import { stateSystemKind } from '../../helpers/systemKind';
import {
  heldLocksIfAny,
  heldLocksOf,
} from '../../integration/helpers/heldLiveLocks';
import { guardedTestConnection } from '../../integration/helpers/refusalGuard';
import { createHandlerContext } from '../../integration/helpers/testHelpers';

const USER = 'WIRE_USER';

let stand: AdtStandIn;
let network: SocketCut;

beforeEach(async () => {
  stateSystemKind();
  setSystemContext({ responsible: USER });
  stand = await adtStandIn();
  network = installSocketCut();
});

afterEach(async () => {
  network.uninstall();
  await stand.close();
  resetSystemContextCache();
});

/** A soft-mode run connection: guarded, connected, with its registry. */
async function runConnection() {
  const connection = guardedTestConnection(
    { url: stand.url, client: '100', authType: 'basic', username: USER },
    new BasicAuthProvider(USER, 'wire-password'),
    { kind: 'onprem' },
  );
  heldLocksOf(connection);
  await connection.connect();
  const context = createHandlerContext({
    connection,
    logger: undefined as never,
  });
  return { connection, context };
}

const unlocks = () =>
  stand.requests.filter((request) => request.url.includes('_action=UNLOCK'));

describe('the registry sees the wire', () => {
  it('a LOCK answered with a handle is held, whoever sent it', async () => {
    const { connection, context } = await runConnection();
    await handleHandlerLock(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_WIRE',
    });
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((owned) => owned.state),
      ['held'],
    );
  });

  it("a handler's own UNLOCK answered ok releases it", async () => {
    const { connection, context } = await runConnection();
    await handleUpdateClass(context, {
      class_name: 'ZCL_WIRE',
      source_code: 'class zcl_wire.',
    });
    assert.equal(heldLocksOf(connection).stillOwned.length, 0);
  });

  it("a handler's own UNLOCK cut on the network leaves the lock unlock-sent", async () => {
    const { connection, context } = await runConnection();
    const held = stand.hold((request) =>
      request.url.includes('_action=UNLOCK'),
    );
    const pending = handleUpdateClass(context, {
      class_name: 'ZCL_WIRE',
      source_code: 'class zcl_wire.',
    });
    await held.arrived;
    network.cut();
    held.release();
    await pending;
    network.restore();
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((owned) => owned.state),
      ['unlock-sent'],
    );
  });

  it('a lock only the wire saw is released by the cleanup, once, with its handle', async () => {
    const { connection, context } = await runConnection();
    await handleHandlerLock(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_WIRE',
    });
    const before = unlocks().length;
    await heldLocksOf(connection).releaseAll(undefined, () => {});
    await heldLocksOf(connection).releaseAll(undefined, () => {});
    assert.equal(unlocks().length - before, 1);
    assert.match(unlocks().at(-1)?.url ?? '', /lockHandle=/);
    assert.equal(heldLocksOf(connection).stillOwned.length, 0);
  });

  it("a session lost on one connection clears its locks, not another's", async () => {
    const run = await runConnection();
    const sibling = await runConnection();
    await handleHandlerLock(run.context, {
      object_type: 'CLASS',
      object_name: 'ZCL_RUN',
    });
    await handleHandlerLock(sibling.context, {
      object_type: 'CLASS',
      object_name: 'ZCL_SIB',
    });
    await sibling.connection.disconnect();
    await sibling.connection
      .makeAdtRequest({ url: '/sap/bc/adt/x', method: 'GET', timeout: 0 })
      .catch(() => {});
    assert.equal(heldLocksOf(sibling.connection).stillOwned.length, 0);
    assert.equal(heldLocksOf(run.connection).stillOwned.length, 1);
  });

  it('a connection with no registry is not tracked', async () => {
    const connection = guardedTestConnection(
      { url: stand.url, client: '100', authType: 'basic', username: USER },
      new BasicAuthProvider(USER, 'wire-password'),
      { kind: 'onprem' },
    );
    await connection.connect();
    const context = createHandlerContext({
      connection,
      logger: undefined as never,
    });
    await handleHandlerLock(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_UNTRACKED',
    });
    assert.equal(heldLocksIfAny(connection), undefined);
  });
});

describe('a lock handle in the sap-adt-lm-handle header (third review)', () => {
  it('a function-group LOCK whose handle comes in the header is held', async () => {
    const { connection } = await runConnection();
    stand.respond(
      (request) => request.url.includes('_action=LOCK'),
      () => ({
        status: 200,
        headers: { 'sap-adt-lm-handle': 'HDR-HANDLE' },
        text: '',
      }),
    );
    connection.setSessionType('stateful');
    await connection.makeAdtRequest({
      url: '/sap/bc/adt/functions/groups/zfg_wire?_action=LOCK&accessMode=MODIFY',
      method: 'POST',
      timeout: 0,
    });
    connection.setSessionType('stateless');
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((owned) => [
        owned.lock.lock_handle,
        owned.state,
      ]),
      [['HDR-HANDLE', 'held']],
    );
  });
});
