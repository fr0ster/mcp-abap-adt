/**
 * The debugger stop's second `stopListener` refused by the credential
 * (plan Task 32, check 2). Live, SAP cannot be made to produce a credential
 * refusal at that step (refusalFollowUps.test.ts: a live session's cookie or
 * the RFC conversation's one logon authenticates it, and an ended session is
 * answered by the ICM first), so this is unit-tested only: a stubbed
 * credential, asked once per request attempt, refuses from the second
 * `stopListener` on.
 *
 * `DebugStop` answers `stopped`: the first `stopListener` succeeded, so the
 * second one's failure is no failure of the stop. Nothing is sent after it,
 * the credential is not asked again, and the session holds nothing.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { InstanceState } from '../../../lib/state/InstanceState';
import { okResponse } from '../../helpers/fakeClient';
import { fakeWorld, IDS, LISTEN_NOTHING, until } from './fakes';

const json = (r: any) => JSON.parse(r.content[0].text);

/** A credential asked once per request attempt; it refuses once told to. */
class StubCredential {
  readonly asked: Array<{ call: string; refused: boolean }> = [];
  refusing = false;

  authorize(call: string): void {
    this.asked.push({ call, refused: this.refusing });
    if (this.refusing) {
      throw new AuthRefusedError(
        authError.connection({
          problem: 'refused-after-renewal',
          at: 'request',
        }),
        'request',
      );
    }
  }
}

function install() {
  const world = fakeWorld();
  const credential = new StubCredential();
  // Every debugger request asks the credential first, as a connection does.
  const abapDebugger = world.ports.abapDebugger;
  world.ports.abapDebugger = (connection, mode) => {
    const inner = abapDebugger(connection, mode) as unknown as Record<
      string,
      unknown
    >;
    return new Proxy(inner, {
      get: (target, key: string) => {
        const member = target[key];
        if (typeof member !== 'function') return member;
        // A request answers by its promise: a refusal rejects it.
        return async (...args: unknown[]) => {
          credential.authorize(key);
          return (member as (...a: unknown[]) => unknown)(...args);
        };
      },
    }) as never;
  };
  const state = new InstanceState();
  const dbg = new DebuggerInstance({
    abap: new DebugSession(world.ports as any, IDS),
    amdp: new AmdpSession({} as any),
  });
  state.attach(dbg);
  const context = {
    connection: {} as any,
    logger: undefined,
    state,
    debugger: () => dbg,
  };
  return { world, credential, dbg, context };
}

describe("the debugger stop's second stopListener refused by the credential", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('DebugStop ends stopped, sends nothing more, asks the credential nothing more, holds nothing', async () => {
    const { world, credential, dbg, context } = install();
    const started = handleDebugStartListener(context as any, {
      breakpoints: [{ statement: 'WRITE' }],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    const handle = json(await started).state_handle;
    await until(() => world.polls.length === 2);
    const open = world.polls[1];

    // The first stopListener succeeds and leaves the open poll unanswered
    // (measured on premise: a poll can reach the system after the stop), so
    // the stop sends a second one; from then on the credential refuses.
    let stops = 0;
    let loggedAtRefusal = -1;
    let askedAtRefusal = -1;
    world.override.stopListener = async () => {
      stops++;
      if (stops === 1) {
        credential.refusing = true;
        return okResponse(undefined);
      }
      return okResponse(undefined); // not reached: the credential refuses first
    };
    const realLog = world.log;
    const realAuthorize = credential.authorize.bind(credential);
    credential.authorize = (call: string) => {
      try {
        realAuthorize(call);
      } finally {
        // The first refusal only: anything after it is what is checked.
        if (
          call === 'stopListener' &&
          credential.refusing &&
          askedAtRefusal < 0
        ) {
          loggedAtRefusal = realLog.length;
          askedAtRefusal = credential.asked.length;
          // The system answers the held poll at last.
          setImmediate(() => open.resolve(LISTEN_NOTHING()));
        }
      }
    };

    const stopping = handleDebugStop(context as any, { state_handle: handle });
    await jest.runAllTimersAsync();
    const stopped: any = await stopping;

    expect(stopped.isError).toBeFalsy();
    expect(json(stopped)).toMatchObject({ state: 'stopped' });
    // The second stopListener was attempted and refused by the credential.
    expect(stops).toBe(1);
    expect(askedAtRefusal).toBeGreaterThan(0);
    expect(credential.asked[askedAtRefusal - 1]).toEqual({
      call: 'stopListener',
      refused: true,
    });
    // Nothing asked of the credential, and no request sent, after it.
    expect(credential.asked.slice(askedAtRefusal)).toEqual([]);
    expect(world.log.slice(loggedAtRefusal)).toEqual([]);
    // The session holds nothing; every connection it opened is closed.
    expect(dbg.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });
});
