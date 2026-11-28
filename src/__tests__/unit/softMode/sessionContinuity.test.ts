/**
 * Session continuity through a network cut (#394, spec §9), on the ADT
 * stand-in with real handlers and the in-process cut: a soft-mode workflow
 * whose write fails on the network ends `network`, and its cleanup —
 * sent once, after the network is back — releases the lock with the
 * original handle on the same connection, in the same SAP session, with no
 * second logon, only LOCK and UNLOCK stateful, nothing sent twice, and the
 * package delete the only request in another (stateless) session.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { handleHandlerCreate } from '../../../../compact-modify/src/handlers/handleHandlerCreate';
import { handleHandlerDelete } from '../../../../compact-modify/src/handlers/handleHandlerDelete';
import { handleHandlerLock } from '../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUpdate } from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleDeletePackage } from '../../../handlers/package/high/handleDeletePackage';
import { resetSystemContextCache } from '../../../lib/systemContext';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { setSystemContext } from '../../helpers/processSystemContext';
import { installSocketCut, type SocketCut } from '../../helpers/socketCut';
import { stateSystemKind } from '../../helpers/systemKind';
import { heldLocksOf } from '../../integration/helpers/heldLiveLocks';
import { endTestConnection } from '../../integration/helpers/openConnections';
import { ownedObjectsOf } from '../../integration/helpers/ownedObjects';
import { guardedTestConnection } from '../../integration/helpers/refusalGuard';
import { softSteps } from '../../integration/helpers/softSteps';
import { StepFailure } from '../../integration/helpers/stepOutcome';
import { createHandlerContext } from '../../integration/helpers/testHelpers';

const USER = 'CONTINUITY_USER';
const NAME = 'ZCL_CONTINUITY';
const PACKAGE = 'ZCONT_PKG';

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

const isLock = (request: StandInRequest) =>
  request.url.includes('_action=LOCK');
const isUnlock = (request: StandInRequest) =>
  request.url.includes('_action=UNLOCK');
const isLogoff = (request: StandInRequest) => request.url.includes('logoff');

async function workflow() {
  const connection = guardedTestConnection(
    { url: stand.url, client: '100', authType: 'basic', username: USER },
    new BasicAuthProvider(USER, 'continuity-password'),
    { kind: 'onprem' },
  );
  let connects = 0;
  const connect = connection.connect;
  connection.connect = async () => {
    connects += 1;
    await connect();
  };
  await connection.connect();
  const context = createHandlerContext({
    connection,
    logger: undefined as never,
  });
  const steps = softSteps(connection, () => {});
  ownedObjectsOf(connection).exists('package', PACKAGE);
  await steps.create('class', NAME, `HandlerCreate CLASS ${NAME}`, () =>
    handleHandlerCreate(context, {
      object_type: 'CLASS',
      class_name: NAME,
      package_name: PACKAGE,
      description: 'continuity',
    }),
  );
  const handle = await steps.lock(
    { type: 'CLASS', name: NAME },
    `HandlerLock CLASS ${NAME}`,
    () =>
      handleHandlerLock(context, { object_type: 'CLASS', object_name: NAME }),
    (held) =>
      handleHandlerLock(context, {
        action: 'unlock',
        object_type: 'CLASS',
        object_name: NAME,
        lock_handle: held,
      }),
  );
  network.cut();
  const failed = steps.must(`HandlerUpdate CLASS ${NAME}`, () =>
    handleHandlerUpdate(context, {
      object_type: 'CLASS',
      class_name: NAME,
      source_code: 'class zcl_continuity.',
      lock_handle: handle,
    }),
  );
  const cleanUp = () =>
    steps.cleanUp(['class', 'package'], {
      class: (name) =>
        handleHandlerDelete(context, {
          object_type: 'CLASS',
          class_name: name,
        }),
      package: (name) =>
        handleDeletePackage(context, {
          package_name: name,
          force_new_connection: true,
        }),
    });
  return { connection, connects: () => connects, handle, failed, cleanUp };
}

describe('a soft-mode workflow keeps its session through a cut', () => {
  it('the cleanup after the network is back: same connection, same session, original handle, nothing twice', async () => {
    const run = await workflow();
    await assert.rejects(
      run.failed,
      (error: unknown) =>
        error instanceof StepFailure && error.outcome === 'network',
    );
    network.restore();
    await run.cleanUp();

    assert.equal(run.connects(), 1, 'no second logon');
    const sent = stand.requests.filter((request) => !isLogoff(request));
    const runSession = sent.find(isLock)?.session;
    assert.notEqual(runSession, undefined);
    // Everything but the package delete is in the run's one session: the
    // sibling's requests are stateless, and name the package or discover.
    const elsewhere = sent.filter((request) => request.session !== runSession);
    assert.ok(elsewhere.length > 0, 'the package delete ran on its sibling');
    for (const request of elsewhere) {
      assert.notEqual(request.sessionType, 'stateful', request.url);
      assert.ok(
        request.url.includes('discovery') ||
          request.body.toLowerCase().includes(PACKAGE.toLowerCase()),
        `${request.method} ${request.url}`,
      );
    }
    assert.equal(
      sent.some(
        (request) =>
          request.session === runSession &&
          request.body.toLowerCase().includes(PACKAGE.toLowerCase()) &&
          request.url.includes('deletion'),
      ),
      false,
      'the package is never deleted on the run connection',
    );
    // The unlock carries the original handle, and is sent once.
    const unlocks = sent.filter(isUnlock);
    assert.equal(unlocks.length, 1);
    assert.equal(unlocks[0]?.session, runSession);
    assert.ok(
      unlocks[0]?.query.includes(encodeURIComponent(run.handle)) ||
        unlocks[0]?.url.includes(run.handle),
    );
    // Only LOCK and UNLOCK go stateful.
    for (const request of sent) {
      if (request.sessionType === 'stateful') {
        assert.ok(isLock(request) || isUnlock(request), request.url);
      }
    }
    // Nothing is sent twice: no write repeats (method, URL and body).
    const writes = sent
      .filter(
        (request) => request.method !== 'GET' && request.method !== 'HEAD',
      )
      .map((request) => `${request.method} ${request.url} ${request.body}`);
    assert.deepEqual(writes, [...new Set(writes)]);
    assert.equal(heldLocksOf(run.connection).stillHeld.length, 0);

    // The file's logoff goes out on the run connection, in the run's own
    // session, once.
    await endTestConnection(run.connection);
    await endTestConnection(run.connection);
    const logoffs = stand.requests.filter(isLogoff);
    assert.equal(
      logoffs.filter((request) => request.session === runSession).length,
      1,
      JSON.stringify(logoffs.map((r) => r.session)),
    );
    assert.ok(stand.loggedOff().includes(runSession ?? ''));
  });

  it('a cleanup while the network is still cut sends its unlock once and keeps the lock owned', async () => {
    const run = await workflow();
    await assert.rejects(run.failed);
    await run.cleanUp();
    network.restore();
    await run.cleanUp();

    assert.equal(
      stand.requests.filter(isUnlock).length,
      0,
      'the cut unlock never arrived',
    );
    assert.deepEqual(
      heldLocksOf(run.connection).stillOwned.map((owned) => owned.state),
      ['unlock-sent'],
    );
    // The delete was sent once into the cut, and is not sent again.
    assert.equal(
      ownedObjectsOf(run.connection).stillOwned.find((o) => o.name === NAME)
        ?.state,
      'delete-sent',
    );
    assert.equal(
      stand.requests.filter(
        (request) =>
          request.method === 'DELETE' ||
          (request.method === 'POST' && request.url.includes('deletion')),
      ).length,
      0,
    );
  });
});
