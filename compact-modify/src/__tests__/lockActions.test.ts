/**
 * `HandlerLock`'s two actions (the owner's merge of `HandlerUnlock` into it):
 * `lock`, the default, takes the lock and keeps it; `unlock` releases it
 * under the handle the lock gave, one UNLOCK request — each answer as it was
 * before the merge. An unlock without its handle is refused, nothing sent.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  LOCK_SUCCESS_XML,
  recordingConnection,
} from '../../../src/__tests__/helpers/recordingConnection';
import { HeldLocks } from '../../../src/lib/state/heldLocks';
import { declareSystemKind } from '../../../src/lib/systemKind';
import {
  handleHandlerLock,
  UNLOCK_NEEDS_HANDLE_WORDS,
} from '../handlers/handleHandlerLock';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

/** A context over a recording connection answering the lock, then the unlock. */
function stand() {
  const connection = recordingConnection([
    { data: LOCK_SUCCESS_XML },
    { data: '' },
  ]);
  declareSystemKind(connection, 'onprem');
  const heldLocks = new HeldLocks();
  const context = {
    connection,
    heldLocks,
    state: { handle: 'STATE_HANDLE_PLACEHOLDER' },
  } as unknown as HandlerContext;
  return { connection, heldLocks, context };
}

/** The text of an MCP answer's first block. */
function textOf(answered: { content: readonly { text?: string }[] }): string {
  return answered.content[0]?.text ?? '';
}

describe('HandlerLock: lock, then unlock through the same tool', () => {
  it('locks with the default action, then unlocks under the handle it gave', async () => {
    const { connection, heldLocks, context } = stand();

    const locked = await handleHandlerLock(context, {
      object_type: 'CLASS',
      object_name: 'ZCL_A',
    });
    assert.equal(locked.isError, false, textOf(locked));
    assert.deepStrictEqual(JSON.parse(textOf(locked)), {
      lock_handle: HANDLE,
      state_handle: 'STATE_HANDLE_PLACEHOLDER',
    });
    assert.equal(heldLocks.holds(HANDLE), true);
    assert.equal(connection.requests.length, 1);
    assert.ok(connection.requests[0]?.url.includes('_action=LOCK'));

    const unlocked = await handleHandlerLock(context, {
      action: 'unlock',
      object_type: 'CLASS',
      object_name: 'ZCL_A',
      lock_handle: HANDLE,
    });
    assert.notEqual(unlocked.isError, true, textOf(unlocked));
    assert.equal(connection.requests.length, 2);
    assert.ok(connection.requests[1]?.url.includes('_action=UNLOCK'));
    assert.ok(connection.requests[1]?.url.includes(`lockHandle=${HANDLE}`));
    assert.equal(heldLocks.holds(HANDLE), false);
  });

  it('refuses an unlock without its lock handle, sending nothing', async () => {
    const { connection, context } = stand();
    const refused = await handleHandlerLock(context, {
      action: 'unlock',
      object_type: 'CLASS',
      object_name: 'ZCL_A',
    });
    assert.equal(refused.isError, true);
    assert.ok(textOf(refused).includes(UNLOCK_NEEDS_HANDLE_WORDS));
    assert.equal(connection.requests.length, 0);
  });
});
