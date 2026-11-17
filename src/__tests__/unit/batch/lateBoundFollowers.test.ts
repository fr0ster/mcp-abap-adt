/**
 * A follower of a late-bound target that throws: every follower is still
 * told of the change, the target's own state is the new one, and the throw
 * is reported to the target's logger in fixed words — `point()` and
 * `seal()` themselves never throw it, so a drop seals, then aborts.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { EnvelopeWatch } from '../../../lib/batch/envelopeWatch';
import {
  LATE_BOUND_DROPPED_WORDS,
  LateBoundConnection,
} from '../../../lib/batch/lateBound';
import { communicationBatch } from '../../../lib/batch/tools';

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
    expect(() => target.point(stateful())).not.toThrow();
    expect(target.getSessionType?.()).toBe('stateful');
    expect(watched.getSessionType?.()).toBe('stateful');
    expect(errors).toEqual(['late-bound target: a follower failed']);
  });

  it('seal(): a throwing follower does not keep a later watcher stale', async () => {
    const errors: string[] = [];
    const target = new LateBoundConnection(recordingLogger(errors));
    const watched = new EnvelopeWatch().over(target);
    target.point(stateful());
    target.onPoint(thrower);
    const late = new EnvelopeWatch().over(target);
    expect(late.getSessionType?.()).toBe('stateful');
    expect(() => target.seal()).not.toThrow();
    expect(target.getSessionType).toBeUndefined();
    expect(watched.getSessionType).toBeUndefined();
    expect(late.getSessionType).toBeUndefined();
    await expect(target.connect()).rejects.toThrow(LATE_BOUND_DROPPED_WORDS);
    expect(errors).toEqual(['late-bound target: a follower failed']);
  });

  it('without a logger: every follower is still told', () => {
    const target = new LateBoundConnection();
    target.onPoint(thrower);
    const told: string[] = [];
    target.onPoint(() => told.push('second'));
    target.onPoint(thrower);
    target.onPoint(() => told.push('fourth'));
    expect(() => target.point(stateful())).not.toThrow();
    expect(told).toEqual(['second', 'fourth']);
  });

  it('communicationBatch: its target reports to the batch logger', () => {
    const errors: string[] = [];
    const target = communicationBatch(recordingLogger(errors)).target;
    target?.onPoint(thrower);
    target?.point(stateful());
    expect(errors).toEqual(['late-bound target: a follower failed']);
  });
});
