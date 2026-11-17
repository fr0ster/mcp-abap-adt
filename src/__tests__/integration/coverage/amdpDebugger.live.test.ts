/**
 * The AMDP debugger at a break, live, on both systems: `AmdpDebugSetBreakpoints`
 * sets the session's breakpoints to the set given, and `AmdpDebugCancel`
 * cancels the stopped debuggee's execution.
 *
 * It only reads and runs the shared AMDP pair (`shared_dependencies`: the
 * class `ZMCP_SHR_DBG_AMDP` with a SQLScript table function, created once by
 * `npm run shared:setup`, never written here): its source is read for the
 * breakpoint marker's line (`AMDP_BREAKPOINT_MARKER`). The session starts
 * with that breakpoint and the class's run (`AmdpDebugStart`); the case waits
 * for the break (`AmdpDebugWait`: each wait goes on the answer of the one
 * before it, no count, no timer), sets the breakpoints, cancels the run, and
 * the session is stopped (`AmdpDebugStop`) on every path.
 *
 * Nothing else may debug for the same SAP user while this runs. Every call
 * goes through the in-process server (the debugger tools are dispatched by
 * it).
 */
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { breakpointLineOf } from '../helpers/amdpFixture';
import { getSharedDependenciesConfig } from '../helpers/configHelpers';
import { liveCall, livePrepare, liveSuite } from '../helpers/live';
import { assertEquals } from '../helpers/liveAssert';
import { member, payloadOf, succeeded } from './ownObjects';

/** The shared AMDP class the configuration names, else its default name. */
function amdpClass(): string {
  const named = member(getSharedDependenciesConfig(), 'amdp_class');
  return (
    typeof named === 'string' ? named : 'ZMCP_SHR_DBG_AMDP'
  ).toUpperCase();
}

/** The session's state handle once it started. */
const session: { handle?: string } = {};

function handle(): string {
  if (session.handle === undefined) throw new Error('no AMDP session started');
  return session.handle;
}

/** AmdpDebugWait until an event of `kind`; the end, idle or an error fail. */
async function untilEvent(kind: string): Promise<unknown> {
  for (;;) {
    const answer = succeeded(
      'AmdpDebugWait',
      await livePrepare('AmdpDebugWait', {
        state_handle: handle(),
        hold_seconds: 30,
      }),
    );
    const payload = payloadOf(answer);
    const state = member(payload, 'state');
    if (state === 'ended' || state === 'idle') {
      throw new Error(`the AMDP session is ${String(state)}: ${answer.text}`);
    }
    const events = member(payload, 'events');
    const hit = Array.isArray(events)
      ? events.find((event) => member(event, 'kind') === kind)
      : undefined;
    if (hit !== undefined) return hit;
  }
}

liveSuite(['onprem', 'cloud'], 'The AMDP debugger at a break', () => {
  after(async () => {
    if (session.handle !== undefined) {
      await livePrepare('AmdpDebugStop', { state_handle: session.handle });
    }
  });

  it('AmdpDebugSetBreakpoints sets the set given at a break, and AmdpDebugCancel cancels the run', async () => {
    const className = amdpClass();
    const read = succeeded(
      `GetClass ${className}`,
      await livePrepare('GetClass', { class_name: className }),
    );
    const source = member(payloadOf(read), 'source');
    const line = breakpointLineOf(typeof source === 'string' ? source : '');
    if (line === 0) {
      throw new Error(
        `the shared class ${className} carries no breakpoint marker; run npm run shared:setup`,
      );
    }
    const breakpoints = [{ class_name: className, line }];
    const started = succeeded(
      'AmdpDebugStart',
      await livePrepare('AmdpDebugStart', {
        stop_existing: false,
        breakpoints,
        run: { kind: 'class', name: className },
      }),
    );
    const stated = member(payloadOf(started), 'state_handle');
    if (typeof stated !== 'string' || stated === '') {
      throw new Error('the AMDP start answered no state handle');
    }
    session.handle = stated;
    const hit = await untilEvent('ON_BREAK');
    assert.equal(member(hit, 'line'), line);

    const set = await liveCall('AmdpDebugSetBreakpoints', {
      state_handle: handle(),
      breakpoints,
    });
    succeeded('AmdpDebugSetBreakpoints', set);
    assertEquals(payloadOf(set), {
      breakpoints: [{ class_name: className, line, state: 'VALID' }],
    });

    const cancelled = await liveCall('AmdpDebugCancel', {
      state_handle: handle(),
    });
    succeeded('AmdpDebugCancel', cancelled);
    assert.equal(cancelled.text, 'cancelled');
  });
});
