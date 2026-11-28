/**
 * Through real handlers on the ADT stand-in, with the network cut in
 * process (`socketCut`): every failure a cut causes answers its typed field
 * (#394) — `connection_cause` for the network, `session_error` for a session
 * the connection no longer has — on the answer or its failure entries, and on
 * a success answer's `cleanup` carrier.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { handleHandlerLock } from '../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUpdate } from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleUpdateClass } from '../../../handlers/class/high/handleUpdateClass';
import { resetSystemContextCache } from '../../../lib/systemContext';
import type { ToolResultLike } from '../../../lib/toolResult';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { setSystemContext } from '../../helpers/processSystemContext';
import { installSocketCut, type SocketCut } from '../../helpers/socketCut';
import { stateSystemKind } from '../../helpers/systemKind';
import { guardedTestConnection } from '../../integration/helpers/refusalGuard';
import { createHandlerContext } from '../../integration/helpers/testHelpers';

const USER = 'CUT_USER';

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

async function connected() {
  const connection = guardedTestConnection(
    { url: stand.url, client: '100', authType: 'basic', username: USER },
    new BasicAuthProvider(USER, 'cut-password'),
    { kind: 'onprem' },
  );
  await connection.connect();
  const context = createHandlerContext({
    connection,
    logger: undefined as never,
  });
  return { connection, context };
}

type Payload = Record<string, unknown>;
const payloadOf = (answer: ToolResultLike): Payload =>
  JSON.parse(answer.content?.[0]?.text ?? '{}') as Payload;

/** `field`'s value on the payload, its `cleanup`, or any failure entry. */
function anywhere(payload: Payload, field: string): unknown[] {
  const found: unknown[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'object' && value !== null) {
      const record = value as Payload;
      if (record[field] !== undefined) found.push(record[field]);
      Object.values(record).forEach(walk);
    }
  };
  walk(payload);
  return found;
}

const lockHandleOf = (answer: ToolResultLike) => {
  const handle = payloadOf(answer).lock_handle;
  assert.equal(typeof handle, 'string');
  return handle as string;
};

describe('a cut network is named by connection_cause', () => {
  it('a high read', async () => {
    const { context } = await connected();
    network.cut();
    const answer = await handleGetClass(context, { class_name: 'ZCL_CUT' });
    assert.equal(answer.isError, true);
    assert.deepEqual(anywhere(payloadOf(answer), 'connection_cause'), [
      'ECONNREFUSED',
    ]);
  });

  it('a compact update under a lock', async () => {
    const { context } = await connected();
    const handle = lockHandleOf(
      await handleHandlerLock(context, {
        object_type: 'CLASS',
        object_name: 'ZCL_CUT',
      }),
    );
    network.cut();
    const answer = await handleHandlerUpdate(context, {
      object_type: 'CLASS',
      class_name: 'ZCL_CUT',
      source_code: 'class zcl_cut.',
      lock_handle: handle,
    });
    assert.equal(answer.isError, true);
    assert.deepEqual(anywhere(payloadOf(answer), 'connection_cause'), [
      'ECONNREFUSED',
    ]);
  });

  it('a high update whose write is cut: the write and the unlock', async () => {
    const { context } = await connected();
    const held = stand.hold((request) => request.method === 'PUT');
    const pending = handleUpdateClass(context, {
      class_name: 'ZCL_CUT',
      source_code: 'class zcl_cut.',
    });
    await held.arrived;
    network.cut();
    held.release();
    const payload = payloadOf(await pending);
    const causes = anywhere(payload, 'connection_cause');
    assert.ok(causes.length >= 2, JSON.stringify(causes));
    assert.ok(causes.every((cause) => cause === 'ECONNREFUSED'));
  });

  it('a high update whose unlock is cut: a success with its cleanup named', async () => {
    const { context } = await connected();
    const held = stand.hold((request) =>
      request.url.includes('_action=UNLOCK'),
    );
    const pending = handleUpdateClass(context, {
      class_name: 'ZCL_CUT',
      source_code: 'class zcl_cut.',
    });
    await held.arrived;
    network.cut();
    held.release();
    const answer = await pending;
    assert.equal(answer.isError, false);
    const payload = payloadOf(answer);
    assert.equal((payload.cleanup as Payload | undefined)?.left_locked, true);
    assert.deepEqual(anywhere(payload, 'connection_cause'), ['ECONNREFUSED']);
  });
});

describe('a session the connection no longer has is named by session_error', () => {
  it('an unlock after the connection was disconnected', async () => {
    const { connection, context } = await connected();
    const handle = lockHandleOf(
      await handleHandlerLock(context, {
        object_type: 'CLASS',
        object_name: 'ZCL_CUT',
      }),
    );
    await connection.disconnect();
    const answer = await handleHandlerLock(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_CUT',
      action: 'unlock',
      lock_handle: handle,
    });
    assert.equal(answer.isError, true);
    assert.deepEqual(anywhere(payloadOf(answer), 'session_error'), [
      'ADT_NOT_CONNECTED',
    ]);
  });
});
