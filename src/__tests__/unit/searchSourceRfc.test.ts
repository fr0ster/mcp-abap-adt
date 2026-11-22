/**
 * SearchSource's sequential version (a destination with no communication
 * batch) over RFC fetches one source at a time: one RFC session answers one
 * call at a time, and parallel fetches lost sources without an error (on
 * premise, 2026-09-26: 4 of 13 read at concurrency 8, all 13 at 1).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { handleSearchSource } from '../../handlers/system/readonly/handleSearchSource';
import { substringLineMatch } from '../../lib/search-source/lineScanner';
import * as orchestrator from '../../lib/search-source/orchestrator';
import { assertMatchObject, assertNoProperty } from '../helpers/assertions';

/** SearchSource at `detail: 'full'`, the JSON answer these cases read (terse answers, step 3). */
const searchSourceFull = (
  context: Parameters<typeof handleSearchSource>[0],
  args: Parameters<typeof handleSearchSource>[1],
) => handleSearchSource(context, { detail: 'full', ...args });

// runSearchSourceWithContext replaced on the module that defines it (the
// handler reads it at call time); the module's other names stay real.
const run = mock.method(
  orchestrator,
  'runSearchSourceWithContext',
  async () => ({ results: [] }),
);

const connectionOf = (connectionType: string) => ({
  getConfig: () => ({ connectionType }),
});
const args = { query: 'Echo:', packages: ['ZPKG'] } as any;

describe('SearchSource concurrency by connection', () => {
  beforeEach(() => run.mock.resetCalls());

  it('runs one fetch at a time over RFC, whatever was asked', async () => {
    await searchSourceFull({ connection: connectionOf('rfc') } as any, args);
    assertMatchObject(run.mock.calls[0]?.arguments[1], { concurrency: 1 });
  });

  it("over HTTP the sequential version's own default applies", async () => {
    await searchSourceFull({ connection: connectionOf('http') } as any, args);
    assertNoProperty(run.mock.calls[0]?.arguments[1], 'concurrency');
  });

  it('the handler wires the shipped strategy', async () => {
    await searchSourceFull({ connection: connectionOf('http') } as any, args);
    assert.equal(
      run.mock.calls[0]?.arguments[2]?.lineMatch,
      substringLineMatch,
    );
  });
});
