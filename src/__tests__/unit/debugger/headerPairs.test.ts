/**
 * A debug session sends each header-taking call with the pair its origin's
 * system keeps (`withAdtHeaders`): the ports name that system's header port
 * for the bound origin (`headersOf`); with no such port, the default pair.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import type { AdtHeaderPort } from '../../../lib/adtHeaders/AdtHeaderPairs';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { liveAmdpPorts, liveDebugPorts } from '../../../lib/debugger/ports';
import { useFakeTimers, useRealTimers } from '../../helpers/fakeTime';
import { recordingConnection } from '../../helpers/recordingConnection';
import { fakeWorld, IDS, LISTEN_NOTHING, START, until } from './fakes';

const KEPT: IAdtHeaders = {
  accept: 'application/kept+xml',
  contentType: 'application/kept-request+xml',
};

const keptPort: AdtHeaderPort = {
  pairFor: () => KEPT,
  remember: () => undefined,
};

/** The `headers` of every setBreakpoints the fake debugger was sent. */
function breakpointHeaders(world: ReturnType<typeof fakeWorld>): unknown[] {
  return world.log
    .filter((entry) => entry.call === 'setBreakpoints')
    .map((entry) => {
      const options = entry.args[2];
      return options !== null && typeof options === 'object'
        ? Reflect.get(options, 'headers')
        : undefined;
    });
}

async function armed(
  world: ReturnType<typeof fakeWorld>,
  session: DebugSession<string>,
) {
  const started = session.start('refuse', START);
  await until(() => world.polls.length === 1);
  world.polls[0]?.resolve(LISTEN_NOTHING());
  await started;
}

describe('a debug session sends with its origin system’s header pair', () => {
  // setTimeout, setInterval, setImmediate and Date faked.
  beforeEach(() =>
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    }),
  );
  afterEach(() => useRealTimers());

  it('the pair the ports name for the origin', async () => {
    const world = fakeWorld();
    const session = new DebugSession(
      { ...world.ports, headersOf: () => ({ adtHeaders: keptPort }) },
      IDS,
    ).bind('origin');
    await armed(world, session);
    assert.deepStrictEqual(breakpointHeaders(world), [KEPT]);
  });

  it('the default pair when the ports name none', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    await armed(world, session);
    assert.deepStrictEqual(breakpointHeaders(world), [
      DEFAULT_ADT_HEADERS['debugger.setBreakpoints'],
    ]);
  });

  it('the live ports name the call context’s own header port', () => {
    const context = {
      connection: recordingConnection([]),
      adtHeaders: keptPort,
    };
    assert.equal(liveDebugPorts().headersOf?.(context).adtHeaders, keptPort);
    assert.equal(liveAmdpPorts().headersOf?.(context).adtHeaders, keptPort);
  });
});
