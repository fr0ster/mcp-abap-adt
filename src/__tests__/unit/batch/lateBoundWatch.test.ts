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
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EnvelopeWatch } from '../../../lib/batch/envelopeWatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { communicationBatch } from '../../../lib/batch/tools';

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
    expect(watched.getSessionType?.()).toBe('stateful');
    expect(watched.getSessionMode?.()).toBe('stateful');
    expect(wrappedSession(watched)).toBe('stateful');
  });

  it('pointed, then wrapped: answers the pointed connection', () => {
    const target = new LateBoundConnection();
    target.point(connectionWith({ type: 'stateful' }));
    const watched = new EnvelopeWatch().over(target);
    expect(watched.getSessionType?.()).toBe('stateful');
    expect(watched.getSessionMode?.()).toBeUndefined();
  });

  it('repointed: answers the connection pointed at now', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point(connectionWith({ type: 'stateful' }));
    expect(watched.getSessionType?.()).toBe('stateful');
    target.point(connectionWith({ type: 'stateless' }));
    expect(watched.getSessionType?.()).toBe('stateless');
    target.point(connectionWith({ mode: 'stateful' }));
    expect(watched.getSessionType?.()).toBeUndefined();
    expect(watched.getSessionMode?.()).toBe('stateful');
    expect(wrappedSession(watched)).toBe('stateful');
  });

  it('unpointed, cleared or sealed: answers no session', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    expect(watched.getSessionType?.()).toBeUndefined();
    expect(watched.getSessionMode?.()).toBeUndefined();
    target.point(connectionWith({ type: 'stateful', mode: 'stateful' }));
    target.point(undefined);
    expect(watched.getSessionType?.()).toBeUndefined();
    expect(watched.getSessionMode?.()).toBeUndefined();
    target.point(connectionWith({ type: 'stateful', mode: 'stateful' }));
    target.seal();
    expect(watched.getSessionType?.()).toBeUndefined();
    expect(watched.getSessionMode?.()).toBeUndefined();
    expect(wrappedSession(watched)).toBe('stateless');
  });

  it('answers nothing for each member the pointed connection lacks', () => {
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point(connectionWith({ type: 'stateful' }));
    expect(watched.getSessionMode?.()).toBeUndefined();
    target.point(connectionWith({ mode: 'stateful' }));
    expect(watched.getSessionType?.()).toBeUndefined();
    target.point(connectionWith({}));
    expect(watched.getSessionType?.()).toBeUndefined();
    expect(watched.getSessionMode?.()).toBeUndefined();
  });

  it('answers at the call, from the member the connection has then', () => {
    let session: Session = 'stateless';
    const target = new LateBoundConnection();
    const watched = new EnvelopeWatch().over(target);
    target.point({
      ...connectionWith({}),
      getSessionType: () => session,
    });
    expect(watched.getSessionType?.()).toBe('stateless');
    session = 'stateful';
    expect(watched.getSessionType?.()).toBe('stateful');
  });
});

describe('communicationBatch', () => {
  it.each<[string, { type?: Session; mode?: Session }, Session]>([
    ['getSessionType', { type: 'stateful' }, 'stateful'],
    ['getSessionMode', { mode: 'stateful' }, 'stateful'],
    ['neither', {}, 'stateless'],
  ])(
    'restores the session of the connection its target points at (%s)',
    async (_, members, restored) => {
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
      await expect(open.connection.execute()).rejects.toBe(refused);
      await part;
      // The envelope's mode, then the wrapped connection's, restored.
      expect(sessions).toEqual(['stateless', restored]);
    },
  );
});
