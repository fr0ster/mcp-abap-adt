/**
 * The package walks' single-request reader (`concurrentReader`, used by
 * `GetPackageContents` and `GetPackageTree` when they read descriptions)
 * keeps the consumer's bound in flight over HTTP (`--requests-in-flight`;
 * absent, one — #391) and one over RFC — the rule SearchSource follows (`readsInFlight`): an RFC connection
 * is one ABAP session, and reads sent to it in parallel were lost without
 * an error (measured on premise, 2026-09-26).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { withSystemKindOf } from '../../../lib/connectionFactory';
import { isRfcConnection, readsInFlight } from '../../../lib/connectionKind';
import { concurrentReader } from '../../../lib/strategies/packageWalk';

/** The consumer's bound these cases run with. */
const IN_FLIGHT = 8;

import { withinTurns } from '../../helpers/withinTurns';

/** A connection of `kind`: only its configuration is read. */
function connectionOf(kind: 'rfc' | 'http'): IAbapConnection {
  return {
    getConfig: () => ({ connectionType: kind }),
  } as unknown as IAbapConnection;
}

/** The most reads in flight at once while `items` are read on `kind`. */
async function mostInFlight(kind: 'rfc' | 'http', items: number) {
  const context = {
    connection: connectionOf(kind),
    logger: undefined,
    requestsInFlight: IN_FLIGHT,
  } as unknown as HandlerContext;
  let inFlight = 0;
  let most = 0;
  const read = concurrentReader(context, async (item: number) => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    // Every read waits a few turns, so the next ones start beside it.
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    inFlight -= 1;
    return item * 2;
  });
  const results = await withinTurns(
    read(Array.from({ length: items }, (_, i) => i)),
    2000,
  );
  return { most, results };
}

describe('concurrentReader: reads in flight by connection kind', () => {
  it(`over HTTP: ${IN_FLIGHT} at once`, async () => {
    const { most, results } = await mostInFlight('http', 20);
    assert.equal(most, IN_FLIGHT);
    assert.deepStrictEqual(
      results.map((r) => (r.ok ? r.value : undefined)),
      Array.from({ length: 20 }, (_, i) => i * 2),
    );
  });

  it('over RFC: one at a time, every item read, in order', async () => {
    const { most, results } = await mostInFlight('rfc', 20);
    assert.equal(most, 1);
    assert.deepStrictEqual(
      results.map((r) => (r.ok ? r.value : undefined)),
      Array.from({ length: 20 }, (_, i) => i * 2),
    );
  });

  it('a batch connection over RFC reads as RFC: one in flight, as the connection it wraps', () => {
    for (const kind of ['rfc', 'http'] as const) {
      const inner = connectionOf(kind);
      const batch = withSystemKindOf(
        new AdtBatchConnection(inner, { endpoint: 'communication' }),
        inner,
      );
      assert.equal(isRfcConnection(batch), kind === 'rfc');
      assert.equal(readsInFlight(batch, 8), kind === 'rfc' ? 1 : 8);
      // A view over that view keeps it too.
      const view = withSystemKindOf({ ...batch }, batch);
      assert.equal(isRfcConnection(view as IAbapConnection), kind === 'rfc');
    }
  });
});
