/**
 * The in-memory store's own rules: each run is its caller's (URL, client and
 * user), a finished run keeps its answer until discarded, a running one is
 * not discarded, 16 per caller running and kept together, and handles of 128
 * random bits after the host's prefix.
 */

import { BACKGROUND_RUNS_PER_CALLER, InMemoryBackgroundRuns } from '../index';

describe('the in-memory store', () => {
  const alice = { url: 'http://sys', client: '100', user: 'ALICE' };
  const bob = { url: 'http://sys', client: '100', user: 'BOB' };
  const otherClient = { url: 'http://sys', client: '200', user: 'ALICE' };
  const run = { tool: 'RuntimeRunClass', object: 'X', started_at: 't0' };
  const answer = { content: [{ type: 'text' as const, text: 'out' }] };

  it('keeps each run for its caller only: URL, client and user', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    for (const someone of [bob, otherClient]) {
      expect(store.get(started.handle, someone)).toBeUndefined();
      expect(store.list(someone)).toEqual([]);
      expect(store.discard(started.handle, someone)).toBe('not-available');
    }
    expect(store.get(started.handle, alice)).toMatchObject({
      state: 'running',
    });
  });

  it('a finished run keeps its answer until discarded; a running one is not discarded', () => {
    const store = new InMemoryBackgroundRuns();
    const started = store.start(alice, run);
    if (!('handle' in started)) throw new Error('refused');
    expect(store.discard(started.handle, alice)).toBe('running');
    store.finish(started.handle, answer, 't1');
    expect(store.get(started.handle, alice)).toEqual({
      ...run,
      run_handle: started.handle,
      state: 'finished',
      finished_at: 't1',
      answer,
    });
    expect(store.discard(started.handle, alice)).toBe('discarded');
    expect(store.get(started.handle, alice)).toBeUndefined();
  });

  it(`refuses the ${BACKGROUND_RUNS_PER_CALLER + 1}th run of a caller, running and kept counted; others are not limited`, () => {
    const store = new InMemoryBackgroundRuns();
    const handles: string[] = [];
    for (let i = 0; i < BACKGROUND_RUNS_PER_CALLER; i += 1) {
      const started = store.start(alice, run);
      if (!('handle' in started)) throw new Error('refused early');
      handles.push(started.handle);
    }
    expect(store.start(alice, run)).toEqual({
      refused: 'limit',
      limit: BACKGROUND_RUNS_PER_CALLER,
    });
    expect('handle' in store.start(bob, run)).toBe(true);
    const first = handles[0] ?? '';
    store.finish(first, answer, 't1');
    // Kept still counts.
    expect('refused' in store.start(alice, run)).toBe(true);
    store.discard(first, alice);
    expect('handle' in store.start(alice, run)).toBe(true);
  });

  it('handles are 128 random bits after the prefix', () => {
    const store = new InMemoryBackgroundRuns({ prefix: 'i7-' });
    const a = store.start(alice, run);
    const b = store.start(alice, run);
    if (!('handle' in a) || !('handle' in b)) throw new Error('refused');
    expect(a.handle).toMatch(/^i7-[0-9a-f]{32}$/);
    expect(a.handle).not.toBe(b.handle);
  });
});
