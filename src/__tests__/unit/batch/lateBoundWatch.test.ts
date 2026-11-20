/**
 * The envelope watch over a late-bound target, as a communication batch
 * composes them (`communicationBatch`): the target is wrapped before it is
 * pointed. The watched connection answers the session members as the
 * connection the target points at when they are called — as the members did
 * before 24.0.0 (`getSessionType()` / `getSessionMode()` reading the pointed
 * connection's same-named member at the call, nothing when it has none or
 * nothing is pointed) — so the batch connection's
 * `getSessionType?.() ?? getSessionMode?.() ?? 'stateless'` reads the
 * session in force.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EnvelopeWatch } from '../../../lib/batch/envelopeWatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { communicationBatch } from '../../../lib/batch/tools';
import { rejectionOf } from '../../helpers/assertions';

type Session = 'stateful' | 'stateless';

/** A connection with only the session members given. */
function connectionWith(members: {
  type?: Session;
  mode?: Session;
}): IAbapConnection {
  const { type, mode } = members;
  return {
    connect: async () => undefined,
    getBaseUrl: async () => undefined,
    getSessionId: () => null,
    setSessionType: () => undefined,
    makeAdtRequest: async () => {
      throw new Error('not sent');
    },
    ...(type === undefined ? {} : { getSessionType: () => type }),
    ...(mode === undefined ? {} : { getSessionMode: () => mode }),
  };
}

/** What the batch connection reads of the connection it wraps. */
function wrappedSession(connection: IAbapConnection): Session {
  return (
    connection.getSessionType?.() ??
    connection.getSessionMode?.() ??
    'stateless'
  );
}

describe('EnvelopeWatch over a LateBoundConnection', () => {
  it('wrapped, then pointed: answers the pointed connection', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point(connectionWith({ type: 'stateful', mode: 'stateful' }));
    assert.equal(watched.getSessionType?.(), 'stateful');
    assert.equal(watched.getSessionMode?.(), 'stateful');
    assert.equal(wrappedSession(watched), 'stateful');
  });

  it('pointed, then wrapped: answers the pointed connection', () => {
    const target = new LateBoundConnection();
    target.point(connectionWith({ type: 'stateful' }));
    const watched = new EnvelopeWatch().over(target);
    assert.equal(watched.getSessionType?.(), 'stateful');
    assert.equal(watched.getSessionMode?.(), undefined);
  });

  it('repointed: answers the connection pointed at now', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point(connectionWith({ type: 'stateful' }));
    assert.equal(watched.getSessionType?.(), 'stateful');
    target.point(connectionWith({ type: 'stateless' }));
    assert.equal(watched.getSessionType?.(), 'stateless');
    target.point(connectionWith({ mode: 'stateful' }));
    assert.equal(watched.getSessionType?.(), undefined);
    assert.equal(watched.getSessionMode?.(), 'stateful');
    assert.equal(wrappedSession(watched), 'stateful');
  });

  it('unpointed, cleared or sealed: answers no session', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    assert.equal(watched.getSessionType?.(), undefined);
    assert.equal(watched.getSessionMode?.(), undefined);
    target.point(connectionWith({ type: 'stateful', mode: 'stateful' }));
    target.point(undefined);
    assert.equal(watched.getSessionType?.(), undefined);
    assert.equal(watched.getSessionMode?.(), undefined);
    target.point(connectionWith({ type: 'stateful', mode: 'stateful' }));
    target.seal();
    assert.equal(watched.getSessionType?.(), undefined);
    assert.equal(watched.getSessionMode?.(), undefined);
    assert.equal(wrappedSession(watched), 'stateless');
  });

  it('answers nothing for each member the pointed connection lacks', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point(connectionWith({ type: 'stateful' }));
    assert.equal(watched.getSessionMode?.(), undefined);
    target.point(connectionWith({ mode: 'stateful' }));
    assert.equal(watched.getSessionType?.(), undefined);
    target.point(connectionWith({}));
    assert.equal(watched.getSessionType?.(), undefined);
    assert.equal(watched.getSessionMode?.(), undefined);
  });

  it('answers at the call, from the member the connection has then', () => {
    let session: Session = 'stateless';
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point({
      ...connectionWith({}),
      getSessionType: () => session,
    });
    assert.equal(watched.getSessionType?.(), 'stateless');
    session = 'stateful';
    assert.equal(watched.getSessionType?.(), 'stateful');
  });
});

describe('communicationBatch', () => {
  for (const [_, members, restored] of [
    ['getSessionType', { type: 'stateful' }, 'stateful'],
    ['getSessionMode', { mode: 'stateful' }, 'stateful'],
    ['neither', {}, 'stateless'],
  ] satisfies ReadonlyArray<
    [string, { type?: Session; mode?: Session }, Session]
  >) {
    it(
      format(
        'restores the session of the connection its target points at (%s)',
        _,
      ),
      async () => {
        const open = communicationBatch();
        const sessions: Session[] = [];
        const refused = new Error('envelope refused');
        open.target?.point({
          ...connectionWith(members),
          setSessionType: (type) => {
            sessions.push(type);
          },
          makeAdtRequest: async () => {
            throw refused;
          },
        });
        const part = open.connection
          .makeAdtRequest({ url: '/sap/bc/adt/x', method: 'GET', timeout: 0 })
          .catch((error: unknown) => error);
        assert.equal(await rejectionOf(open.connection.execute()), refused);
        await part;
        // The envelope's mode, then the wrapped connection's, restored.
        assert.deepStrictEqual(sessions, ['stateless', restored]);
      },
    );
  }
});
