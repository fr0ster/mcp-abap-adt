/**
 * A debugger cleanup that meets a credential failure — connection's
 * `AuthRefusedError` (SAP never asked) or a `401` SAP answered — stops: no
 * further request is sent (each would ask the credential again), the refusal
 * is the answer as it came with its step, the steps left are named in fixed
 * words, and they stay for the next stop.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import {
  DebugCleanupError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import { NOT_ATTEMPTED_WORDS } from '../../../lib/debugger/failures';
import { return_error } from '../../../lib/utils';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { fakeWorld, IDS, LISTEN_NOTHING, rowsXml, until } from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
const ROWS = () =>
  okResponse(
    rowsXml([
      { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri },
      { kind: 'exception', id: 'E1', clientId: 'bp2', exceptionClass: 'CX_A' },
    ]),
  );

const refused = () =>
  new AuthRefusedError(
    authError.connection({ problem: 'refused-after-renewal', at: 'request' }),
    'request',
  );
const unauthorized = () =>
  refusedResponse('Unauthorized', {
    response: { status: 401, data: '' },
  } as never);

const payloadOf = (error: unknown) =>
  JSON.parse((return_error(error) as any).content[0].text);

describe('a debugger cleanup that meets a credential failure', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function armed(world = fakeWorld()) {
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  const stopFailure = async (session: DebugSession) => {
    const stopped = session.stop().then(
      () => undefined,
      (e: unknown) => e,
    );
    const error = await stopped;
    expect(error).toBeInstanceOf(DebugCleanupError);
    return error;
  };

  it('stopListener rejects with AuthRefusedError: no breakpoint is deleted, the refusal is the answer with its step, the deletes are named not attempted', async () => {
    const { session, world } = await armed();
    world.override.stopListener = async () => {
      throw refused();
    };
    world.calls.length = 0;
    const error = await stopFailure(session);
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    const payload = payloadOf(error);
    expect(payload).toMatchObject({
      error: 'authentication_failed',
      kind: 'connection',
      step: 'stop listener',
      not_attempted: {
        message: NOT_ATTEMPTED_WORDS,
        steps: ['delete breakpoint L10', 'delete breakpoint E1'],
      },
    });
    expect(payload.failures).toBeUndefined();
    // Kept for the next stop, which sends what was not attempted.
    expect(session.holdsState()).toBe(true);
    delete world.override.stopListener;
    world.calls.length = 0;
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(session.holdsState()).toBe(false);
  });

  it('stopListener answered 401 by SAP: the same, no breakpoint is deleted', async () => {
    const { session, world } = await armed();
    world.override.stopListener = async () => unauthorized();
    world.calls.length = 0;
    const error = await stopFailure(session);
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(payloadOf(error)).toMatchObject({
      status: 401,
      step: 'stop listener',
      not_attempted: {
        steps: ['delete breakpoint L10', 'delete breakpoint E1'],
      },
    });
  });

  it('a delete refused by the credential: the next delete is not attempted, the earlier failure stays beside it', async () => {
    const { session, world } = await armed();
    world.override.stopListener = async () => refusedResponse('listener busy');
    const deletes: string[] = [];
    world.override.deleteBreakpoint = async (_i: unknown, id: string) => {
      deletes.push(id);
      throw refused();
    };
    const error = await stopFailure(session);
    expect(deletes).toEqual(['L10']);
    const payload = payloadOf(error);
    expect(payload).toMatchObject({
      error: 'authentication_failed',
      step: 'delete breakpoint L10',
      failures: [{ message: 'listener busy', step: 'stop listener' }],
      not_attempted: { steps: ['delete breakpoint E1'] },
    });
  });

  it('a start whose listen the credential refused after its arming: its cleanup sends nothing and names what it did not attempt', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC] }).then(
      () => undefined,
      (e: unknown) => e,
    );
    await until(() => world.polls.length === 1);
    world.calls.length = 0;
    world.polls[0].reject(refused());
    const error = await s;
    expect(world.calls).not.toContain('stopListener');
    expect(error).toBeInstanceOf(DebugCleanupError);
    expect(payloadOf(error)).toMatchObject({
      error: 'authentication_failed',
      step: 'listen',
      not_attempted: { steps: ['stop listener'] },
    });
    expect(session.holdsState()).toBe(true);
    // What was not attempted is still owed: the next stop sends it.
    world.calls.length = 0;
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(session.holdsState()).toBe(false);
  });

  it('a start whose reconciling stopListener the credential refused: nothing is armed, no further request, the refusal is the answer', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    const stops: string[] = [];
    world.override.stopListener = async () => {
      stops.push('stopListener');
      throw refused();
    };
    const session = new DebugSession(world.ports, {
      ...IDS,
      stated: true,
    }).bind('origin');
    const error = await session.start('refuse', { breakpoints: [A, EXC] }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(world.calls.some((c) => c.startsWith('setBreakpoints'))).toBe(false);
    expect(world.calls.some((c) => c.startsWith('listen'))).toBe(false);
    expect(stops).toEqual(['stopListener']);
    expect(payloadOf(error)).toMatchObject({
      error: 'authentication_failed',
      step: 'start',
      not_attempted: { steps: ['stop listener'] },
    });
  });
});
