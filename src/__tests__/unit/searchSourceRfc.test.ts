/**
 * SearchSource over RFC fetches one source at a time: one RFC session answers
 * one call at a time, and parallel fetches lost sources without an error
 * (on premise, 2026-09-26: 4 of 13 read at concurrency 8, all 13 at 1).
 */
const run = jest.fn(async () => ({ results: [] }));
jest.mock('../../lib/search-source/orchestrator', () => ({
  runSearchSourceWithContext: (...args: unknown[]) => (run as any)(...args),
}));

import { handleSearchSource } from '../../handlers/system/readonly/handleSearchSource';

const connectionOf = (connectionType: string) => ({
  getConfig: () => ({ connectionType }),
});
const args = { query: 'Echo:', packages: ['ZPKG'], concurrency: 8 } as any;

describe('SearchSource concurrency by connection', () => {
  beforeEach(() => run.mockClear());

  it('runs one fetch at a time over RFC, whatever was asked', async () => {
    await handleSearchSource({ connection: connectionOf('rfc') } as any, args);
    expect((run.mock.calls[0] as any[])[1]).toMatchObject({ concurrency: 1 });
  });

  it('keeps the caller concurrency over HTTP', async () => {
    await handleSearchSource({ connection: connectionOf('http') } as any, args);
    expect((run.mock.calls[0] as any[])[1]).toMatchObject({ concurrency: 8 });
  });
});
