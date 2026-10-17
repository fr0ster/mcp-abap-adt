/**
 * A fresh connection ended after it was recorded but before its `connect()`
 * (the instance's sweep, or the cut of the background runs it started, landing
 * in that gap) is never connected: the open answers the close's refusal.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { isClosedInstanceRefusal } from '../../../lib/auth/failures';
import { endConnection } from '../../../lib/ownedConnections';
import {
  openFreshConnection,
  registerFreshConnectionFactory,
} from '../../../lib/packageSessions';

it('a connection ended between its recording and its connect is never connected', async () => {
  const events: string[] = [];
  const fresh = {
    connect: async () => {
      events.push('connect');
    },
    disconnect: async () => {
      events.push('disconnect');
    },
  } as unknown as IAbapConnection;
  const caller = {} as IAbapConnection;
  registerFreshConnectionFactory(caller, async () => fresh);
  const refused = openFreshConnection(caller, undefined as never, (born) => {
    // Lands in the gap after the recording, before the connect.
    queueMicrotask(() => {
      void endConnection(born);
    });
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  const error = await refused;
  expect(isClosedInstanceRefusal(error)).toBe(true);
  expect(events).toEqual(['disconnect']);
  registerFreshConnectionFactory(caller, undefined);
});
