/**
 * The in-memory store's own rules: each run is its caller's (URL, client and
 * user), a finished run keeps its answer until discarded, a running one is
 * not discarded, 16 per caller running and kept together, and handles of 128
 * random bits after the host's prefix.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertMatchObject } from '../../../src/__tests__/helpers/assertions';
import { BACKGROUND_RUNS_PER_CALLER, InMemoryBackgroundRuns } from '../index';

describe('the in-memory store', () => {
  const alice = { system: 'http://sys', client: '100', user: 'ALICE' };
  const bob = { system: 'http://sys', client: '100', user: 'BOB' };
  const otherClient = { system: 'http://sys', client: '200', user: 'ALICE' };
  const run = { tool: 'RuntimeRunClass', object: 'X', started_at: 't0' };
  const answer = { content: [{ type: 'text' as const, text: 'out' }] };

  it('keeps each run for its caller only: URL, client and user', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    for (const someone of [bob, otherClient]) {
      assert.equal(store.get(started.handle, someone), undefined);
      assert.deepStrictEqual(store.list(someone), []);
      assert.equal(store.discard(started.handle, someone), 'not-available');
    }
    assertMatchObject(store.get(started.handle, alice), {
      state: 'running',
    });
  });

  it('a finished run keeps its answer until discarded; a running one is not discarded', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    assert.equal(store.discard(started.handle, alice), 'running');
    store.finish(started.handle, answer, 't1');
    assert.deepStrictEqual(store.get(started.handle, alice), {
      ...run,
      run_handle: started.handle,
      state: 'finished',
      finished_at: 't1',
      answer,
    });
    assert.equal(store.discard(started.handle, alice), 'discarded');
    assert.equal(store.get(started.handle, alice), undefined);
  });

  it(`refuses the ${BACKGROUND_RUNS_PER_CALLER + 1}th run of a caller, running and kept counted; others are not limited`, () => {
    const store = new InMemoryBackgroundRuns();
    const handles: string[] = [];
    for (let i = 0; i < BACKGROUND_RUNS_PER_CALLER; i += 1) {
      const started = store.start(alice, run);
      if (!('handle' in started)) throw new Error('refused early');
      handles.push(started.handle);
    }
    assert.deepStrictEqual(store.start(alice, run), {
      refused: 'limit',
      limit: BACKGROUND_RUNS_PER_CALLER,
    });
    assert.equal('handle' in store.start(bob, run), true);
    const first = handles[0] ?? '';
    store.finish(first, answer, 't1');
    // Kept still counts.
    assert.equal('refused' in store.start(alice, run), true);
    store.discard(first, alice);
    assert.equal('handle' in store.start(alice, run), true);
  });

  it('handles are 128 random bits after the prefix', () => {
    const store = new InMemoryBackgroundRuns({ prefix: 'i7-' });
    const a = store.start(alice, run);
    const b = store.start(alice, run);
    if (!('handle' in a) || !('handle' in b)) throw new Error('refused');
    assert.match(a.handle, /^i7-[0-9a-f]{32}$/);
    assert.notEqual(a.handle, b.handle);
  });

  it('a kept answer carrying cancelled: true is read and listed as cancelled, and is discarded like a finished one', () => {
    const store = new InMemoryBackgroundRuns();
    const read = { tool: 'GetSqlQuery', object: '', started_at: 't0' };
    const started = store.start(alice, read);
    if (!('handle' in started)) throw new Error('refused');
    const cancelled = {
      cancelled: true as const,
      content: [{ type: 'text' as const, text: 'cancelled' }],
    };
    store.finish(started.handle, cancelled, 't1');
    // A late answer changes nothing: the first kept answer stays.
    store.finish(started.handle, answer, 't2');
    assert.deepStrictEqual(store.get(started.handle, alice), {
      ...read,
      run_handle: started.handle,
      state: 'cancelled',
      finished_at: 't1',
      answer: cancelled,
    });
    assert.deepStrictEqual(store.list(alice), [
      {
        ...read,
        run_handle: started.handle,
        state: 'cancelled',
        finished_at: 't1',
      },
    ]);
    assert.equal(store.discard(started.handle, alice), 'discarded');
    assert.equal(store.get(started.handle, alice), undefined);
  });
});
