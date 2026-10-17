/**
 * An internal batch phase (spec §11, the shared mechanism): `runPhase` records
 * `read(item, batch)` for every item on one `AdtBatchConnection` over the
 * call's connection, sends it in one envelope, and answers each item's
 * settlement in item order. A part's non-2xx is that item's failure; an
 * envelope that fails is every item's failure, the envelope's error as it
 * came; a credential refusal is rethrown, never a result.
 *
 * Real `AdtBatchConnection` (adt-clients 34.x); only the connection is a fake.
 */
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { runPhase } from '../../../lib/batch/phases';
import {
  envelopeConnection,
  partByPart,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const ITEMS = ['ITEM_A', 'ITEM_B', 'ITEM_C'] as const;

/** One GET per item, its answer's body the value. */
const read = async (item: string, batch: IAbapConnection) => {
  const response = await batch.makeAdtRequest<string>({
    url: `/sap/bc/adt/probe/${item.toLowerCase()}`,
    method: 'GET',
    timeout: 0,
  });
  return response.data;
};

const contextOn = (connection: unknown): HandlerContext =>
  ({ connection, logger: undefined }) as unknown as HandlerContext;

describe('runPhase', () => {
  it('all items in one envelope; results in item order', async () => {
    const fake = envelopeConnection(
      partByPart((inner) => ({
        status: 200,
        statusText: 'OK',
        body: inner.url,
      })),
    );
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    expect(fake.envelopes).toHaveLength(1);
    expect(fake.envelopes[0]?.url).toBe('/sap/bc/adt/communication/batch');
    expect(fake.envelopes[0]?.parts.map((p) => p.url)).toEqual([
      '/sap/bc/adt/probe/item_a',
      '/sap/bc/adt/probe/item_b',
      '/sap/bc/adt/probe/item_c',
    ]);
    expect(fake.directs).toHaveLength(0);
    expect(results).toEqual([
      { ok: true, value: '/sap/bc/adt/probe/item_a' },
      { ok: true, value: '/sap/bc/adt/probe/item_b' },
      { ok: true, value: '/sap/bc/adt/probe/item_c' },
    ]);
  });

  it("a part's 404 is that item's failure, the rest answer", async () => {
    const fake = envelopeConnection(
      partByPart((inner) =>
        inner.url.endsWith('item_b')
          ? { status: 404, statusText: 'Not Found', body: 'absent' }
          : { status: 200, statusText: 'OK', body: inner.url },
      ),
    );
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    expect(fake.envelopes).toHaveLength(1);
    expect(results[0]).toEqual({ ok: true, value: '/sap/bc/adt/probe/item_a' });
    expect(results[2]).toEqual({ ok: true, value: '/sap/bc/adt/probe/item_c' });
    const failed = results[1];
    expect(failed?.ok).toBe(false);
    expect(
      (failed as { error: { response?: { status?: number } } }).error.response
        ?.status,
    ).toBe(404);
  });

  it("an envelope failure is every item's, as it came", async () => {
    const thrown = statusError(500, 'Internal Server Error', 'placeholder');
    const fake = envelopeConnection(() => {
      throw thrown;
    });
    const results = await withinTurns(
      runPhase(contextOn(fake.connection), ITEMS, read),
    );

    expect(fake.envelopes).toHaveLength(1);
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect((result as { error: unknown }).error).toBe(thrown);
    }
  });

  it('a credential refusal rethrows', async () => {
    const refusal = new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
    const fake = envelopeConnection(() => {
      throw refusal;
    });
    await expect(
      withinTurns(runPhase(contextOn(fake.connection), ITEMS, read)),
    ).rejects.toBe(refusal);
    expect(fake.envelopes).toHaveLength(1);
  });
});
