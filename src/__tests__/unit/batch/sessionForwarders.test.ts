/**
 * The late-bound and envelope-watching batch connections forward the
 * session members as the connection under them has them: each member
 * reaches the same-named member only, and a member the connection lacks
 * (or no connection) answers nothing — as the batch connection reads them,
 * `getSessionType?.() ?? getSessionMode?.() ?? 'stateless'`.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { EnvelopeWatch } from '../../../lib/batch/envelopeWatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';

type Session = 'stateful' | 'stateless';

/** A connection with only the session members given, recording each call. */
function connectionWith(
  members: { type?: Session; mode?: Session },
  calls: string[],
): IAbapConnection {
  const base = {
    connect: async () => undefined,
    getBaseUrl: async () => undefined,
    getSessionId: () => null,
    setSessionType: () => undefined,
    makeAdtRequest: async () => ({ status: 200, data: '', headers: {} }),
  };
  const { type, mode } = members;
  return {
    ...base,
    ...(type === undefined
      ? {}
      : {
          getSessionType: () => {
            calls.push('getSessionType');
            return type;
          },
        }),
    ...(mode === undefined
      ? {}
      : {
          getSessionMode: () => {
            calls.push('getSessionMode');
            return mode;
          },
        }),
  } as unknown as IAbapConnection;
}

const forwarders: [string, (under?: IAbapConnection) => IAbapConnection][] = [
  [
    'LateBoundConnection',
    (under?: IAbapConnection): IAbapConnection => {
      const late = new LateBoundConnection();
      late.point(under);
      return late;
    },
  ],
  [
    'EnvelopeWatch',
    (under) => new EnvelopeWatch().over(under ?? connectionWith({}, [])),
  ],
];

describe.each(forwarders)('%s forwards the session members', (_, over) => {
  it('answers nothing for a member the connection lacks, and calls no other', () => {
    const calls: string[] = [];
    const typeOnly = over(connectionWith({ type: 'stateful' }, calls));
    expect(typeOnly.getSessionType?.()).toBe('stateful');
    expect(typeOnly.getSessionMode?.()).toBeUndefined();
    const modeOnly = over(connectionWith({ mode: 'stateful' }, calls));
    expect(modeOnly.getSessionType?.()).toBeUndefined();
    expect(modeOnly.getSessionMode?.()).toBe('stateful');
    expect(calls).toEqual(['getSessionType', 'getSessionMode']);
  });

  it('answers each member from the same-named one', () => {
    const calls: string[] = [];
    const both = over(
      connectionWith({ type: 'stateful', mode: 'stateless' }, calls),
    );
    expect(both.getSessionType?.()).toBe('stateful');
    expect(both.getSessionMode?.()).toBe('stateless');
    expect(calls).toEqual(['getSessionType', 'getSessionMode']);
  });
});

describe('LateBoundConnection pointed at no connection', () => {
  it('answers no session', () => {
    const late = new LateBoundConnection();
    expect(late.getSessionType?.()).toBeUndefined();
    expect(late.getSessionMode?.()).toBeUndefined();
  });
});
