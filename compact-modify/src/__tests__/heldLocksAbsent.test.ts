/**
 * A handler called with no held locks (a group registered on a plain
 * McpServer, outside any server instance) takes no lock and sends nothing
 * under a lock_handle (#4): SAP releases the locking session's lock on an
 * UNLOCK whatever handle it names, so only the handles an instance kept tell
 * its own lock from another's, and without an owner there are none.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import { declareSystemKind } from '../../../src/lib/systemKind';
import {
  handleHandlerLock,
  handleHandlerLock as lockOrUnlock,
} from '../handlers/handleHandlerLock';
import { handleHandlerUpdate } from '../handlers/handleHandlerUpdate';

/** An unlock, as the merged HandlerLock takes it: `action: 'unlock'`. */
const handleHandlerUnlock = (
  context: Parameters<typeof lockOrUnlock>[0],
  args: Omit<Parameters<typeof lockOrUnlock>[1], 'action'>,
) => lockOrUnlock(context, { ...args, action: 'unlock' });

process.env.SAP_SYSTEM_TYPE = 'onprem';

const textOf = (answered: unknown): string => JSON.stringify(answered);

function bare() {
  const connection = recordingConnection();
  declareSystemKind(connection, 'onprem');
  const context: HandlerContext = { connection };
  return { connection, context };
}

it('HandlerLock without held locks is refused, sending nothing', async () => {
  const { connection, context } = bare();
  const answered = await handleHandlerLock(context, {
    object_type: 'CLASS',
    object_name: 'ZCL_A',
  });
  assert.ok(
    textOf(answered).includes('locks are not kept by this server instance'),
  );
  assert.deepStrictEqual(connection.requests, []);
});

it('HandlerUnlock and HandlerUpdate without held locks are refused, sending nothing', async () => {
  const { connection, context } = bare();
  const unlocked = await handleHandlerUnlock(context, {
    object_type: 'CLASS',
    object_name: 'ZCL_A',
    lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
  });
  assert.ok(
    textOf(unlocked).includes('lock_handle is not held by this instance'),
  );
  const updated = await handleHandlerUpdate(context, {
    object_type: 'CLASS',
    class_name: 'ZCL_A',
    source_code: 'placeholder source',
    lock_handle: 'LOCK_HANDLE_PLACEHOLDER',
  });
  assert.ok(
    textOf(updated).includes('lock_handle is not held by this instance'),
  );
  assert.deepStrictEqual(connection.requests, []);
});
