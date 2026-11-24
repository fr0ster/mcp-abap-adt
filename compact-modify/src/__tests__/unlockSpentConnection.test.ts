/**
 * HandlerUnlock on a spent connection (the owner's decision): an unlock the
 * connection answers with its own session error (`ADT_SESSION_REPLACED`,
 * `ADT_NOT_CONNECTED`) means the lock went with its SAP session, and SAP's
 * logoff of that session released it. The answer says so and the instance no
 * longer holds the handle. The reading is the typed verdict's (adt-clients
 * 45.4 carries the connection's code as `sessionError`), never the words;
 * every other failure stays a failure and the handle stays held.
 */

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { format } from 'node:util';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { holding } from '../../../src/__tests__/helpers/heldLocks';
import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import { LOCK_WENT_WITH_SESSION_WORDS } from '../../../src/lib/strategies/withLock';
import { declareSystemKind } from '../../../src/lib/systemKind';
import { handleHandlerLock as lockOrUnlock } from '../handlers/handleHandlerLock';

/** An unlock, as the merged HandlerLock takes it: `action: 'unlock'`. */
const handleHandlerUnlock = (
  context: Parameters<typeof lockOrUnlock>[0],
  args: Omit<Parameters<typeof lockOrUnlock>[1], 'action'>,
) => lockOrUnlock(context, { ...args, action: 'unlock' });

process.env.SAP_SYSTEM_TYPE = 'onprem';

const HANDLE = 'HANDLE_A';

/** A connection whose UNLOCK rejects with `thrown`; every other request is the recorder's. */
function unlockRejecting(thrown: unknown): IAbapConnection {
  const base = recordingConnection();
  const connection = {
    ...base,
    makeAdtRequest: async (options: IAbapRequestOptions) => {
      if (String(options.url).includes('_action=UNLOCK')) throw thrown;
      return base.makeAdtRequest(options);
    },
  } as unknown as IAbapConnection;
  declareSystemKind(connection, 'onprem');
  return connection;
}

function contextOver(connection: IAbapConnection) {
  const heldLocks = holding(HANDLE);
  const context = { connection, heldLocks } as unknown as HandlerContext;
  return { context, heldLocks };
}

const unlock = (context: HandlerContext) =>
  handleHandlerUnlock(context, {
    object_type: 'CLASS',
    object_name: 'ZCL_A',
    lock_handle: HANDLE,
  });

const textOf = (answered: { content?: Array<{ text?: unknown }> }) =>
  (answered.content ?? []).map((part) => String(part.text ?? '')).join('');

for (const code of ['ADT_SESSION_REPLACED', 'ADT_NOT_CONNECTED']) {
  it(
    format(
      'an unlock the connection answers %s: the lock went with the session, the handle is no longer held',
      code,
    ),
    async () => {
      const { context, heldLocks } = contextOver(
        unlockRejecting(Object.assign(new Error('words never read'), { code })),
      );
      const answered = await unlock(context);
      assert.ok(!answered.isError);
      assert.deepStrictEqual(JSON.parse(textOf(answered)), {
        unlocked: false,
        reason: LOCK_WENT_WITH_SESSION_WORDS,
      });
      assert.equal(heldLocks.holds(HANDLE), false);
    },
  );
}

it('an unlock that fails otherwise stays a failure, and the handle stays held', async () => {
  const { context, heldLocks } = contextOver(
    unlockRejecting(
      Object.assign(new Error('ADT_SESSION_REPLACED only in the words'), {
        code: 'ECONNRESET',
      }),
    ),
  );
  const answered = await unlock(context);
  assert.equal(answered.isError, true);
  assert.ok(!textOf(answered).includes(LOCK_WENT_WITH_SESSION_WORDS));
  assert.equal(heldLocks.holds(HANDLE), true);
});
