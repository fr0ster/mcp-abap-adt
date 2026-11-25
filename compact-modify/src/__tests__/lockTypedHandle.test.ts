/**
 * `HandlerLock` answers from the typed lock handle beside the instance's
 * `state_handle` (Codex P2 on terse answers), never from a parse of another
 * tool's serialized answer: `LockObjectLow`'s answer text is replaced here
 * with text no parse can read, and the lock still answers its handle, keeps
 * it, and names the state.
 */

import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import * as lockModule from '../../../src/handlers/common/low/handleLockObject';

// LockObjectLow's answer, replaced on the module that defines it before the
// facade loads: a HandlerLock that parsed it would find no handle.
mock.method(lockModule, 'lockObject', async () => ({
  isError: false,
  content: [{ type: 'text', text: 'LOCK_TEXT_NO_PARSE_CAN_READ' }],
}));

import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  LOCK_SUCCESS_XML,
  recordingConnection,
} from '../../../src/__tests__/helpers/recordingConnection';
import { HeldLocks } from '../../../src/lib/state/heldLocks';
import { declareSystemKind } from '../../../src/lib/systemKind';
import { handleHandlerLock } from '../handlers/handleHandlerLock';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

it('answers the typed handle and state_handle, and keeps the lock', async () => {
  const connection = recordingConnection([{ data: LOCK_SUCCESS_XML }]);
  declareSystemKind(connection, 'onprem');
  const heldLocks = new HeldLocks();
  const context = {
    connection,
    heldLocks,
    state: { handle: 'STATE_HANDLE_PLACEHOLDER' },
  } as unknown as HandlerContext;

  const answered: any = await handleHandlerLock(context, {
    object_type: 'CLASS',
    object_name: 'ZCL_A',
  });

  assert.equal(answered.isError, false, JSON.stringify(answered));
  assert.deepStrictEqual(JSON.parse(answered.content[0].text), {
    lock_handle: HANDLE,
    state_handle: 'STATE_HANDLE_PLACEHOLDER',
  });
  assert.equal(heldLocks.holds(HANDLE), true);
});
