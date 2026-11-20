/**
 * A follower of a late-bound target that throws: every follower is still
 * told of the change, the target's own state is the new one, and the throw
 * is reported to the target's logger in fixed words — `point()` and
 * `seal()` themselves never throw it, so a drop seals, then aborts.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { EnvelopeWatch } from '../../../lib/batch/envelopeWatch';
import {
  LATE_BOUND_DROPPED_WORDS,
  LateBoundConnection,
} from '../../../lib/batch/lateBound';
import { communicationBatch } from '../../../lib/batch/tools';
import { assertRejects } from '../../helpers/assertions';

function stateful(): IAbapConnection {
  return {
    connect: async () => undefined,
    getBaseUrl: async () => undefined,
    getSessionId: () => null,
    setSessionType: () => undefined,
    makeAdtRequest: async () => {
      throw new Error('not sent');
    },
    getSessionType: () => 'stateful',
  };
}

function recordingLogger(errors: string[]): ILogger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (message: string) => {
      errors.push(message);
    },
  };
}

const thrower = () => {
  throw new Error('follower secret text');
};

describe('LateBoundConnection followers', () => {
  it('point(): a throwing follower does not keep a later watcher stale', () => {
    const errors: string[] = [];
    const target = new LateBoundConnection(recordingLogger(errors));
    target.onPoint(thrower);
    const watched = new EnvelopeWatch().over(target);
    target.point(stateful());
    assert.equal(target.getSessionType?.(), 'stateful');
    assert.equal(watched.getSessionType?.(), 'stateful');
    assert.deepStrictEqual(errors, ['late-bound target: a follower failed']);
  });

  it('seal(): a throwing follower does not keep a later watcher stale', async () => {
    const errors: string[] = [];
    const target = new LateBoundConnection(recordingLogger(errors));
    const watched = new EnvelopeWatch().over(target);
    target.point(stateful());
    target.onPoint(thrower);
    const late = new EnvelopeWatch().over(target);
    assert.equal(late.getSessionType?.(), 'stateful');
    target.seal();
    assert.equal(target.getSessionType, undefined);
    assert.equal(watched.getSessionType, undefined);
    assert.equal(late.getSessionType, undefined);
    await assertRejects(target.connect(), LATE_BOUND_DROPPED_WORDS);
    assert.deepStrictEqual(errors, ['late-bound target: a follower failed']);
  });

  it('without a logger: every follower is still told', () => {
    const target = new LateBoundConnection();
    target.onPoint(thrower);
    const told: string[] = [];
    target.onPoint(() => told.push('second'));
    target.onPoint(thrower);
    target.onPoint(() => told.push('fourth'));
    target.point(stateful());
    assert.deepStrictEqual(told, ['second', 'fourth']);
  });

  it('communicationBatch: its target reports to the batch logger', () => {
    const errors: string[] = [];
    const target = communicationBatch(recordingLogger(errors)).target;
    target?.onPoint(thrower);
    target?.point(stateful());
    assert.deepStrictEqual(errors, ['late-bound target: a follower failed']);
  });
});
