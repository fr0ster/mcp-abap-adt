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

import { readFile } from 'node:fs/promises';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import {
  LATE_RECORD_WORDS,
  MORE_ENVELOPES_WORDS,
  runPhase,
} from '../../../lib/batch/phases';
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

  describe('every read records before the envelope is sent', () => {
    const answered = () =>
      envelopeConnection(
        partByPart((inner) => ({
          status: 200,
          statusText: 'OK',
          body: inner.url,
        })),
      );
    const turn = () => new Promise((resolve) => setImmediate(resolve));

    it('a read that waits two event-loop turns before recording lands in the one envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          if (item === 'ITEM_B') {
            await turn();
            await turn();
          }
          return read(item, batch);
        }),
      );
      expect(fake.envelopes).toHaveLength(1);
      expect(fake.envelopes[0]?.parts).toHaveLength(3);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it('a read that awaits real I/O before recording lands in the one envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          if (item === 'ITEM_C') await readFile(__filename);
          return read(item, batch);
        }),
        5_000,
      );
      expect(fake.envelopes).toHaveLength(1);
      expect(fake.envelopes[0]?.parts.map((p) => p.url)).toEqual([
        '/sap/bc/adt/probe/item_a',
        '/sap/bc/adt/probe/item_b',
        '/sap/bc/adt/probe/item_c',
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it('a read that settles without recording is its own answer; the others go in the envelope', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) =>
          item === 'ITEM_A' ? 'nothing to read' : read(item, batch),
        ),
      );
      expect(results[0]).toEqual({ ok: true, value: 'nothing to read' });
      expect(fake.envelopes).toHaveLength(1);
      expect(fake.envelopes[0]?.parts).toHaveLength(2);
    });

    it('no read records: nothing is sent', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async () => 'none'),
      );
      expect(fake.envelopes).toHaveLength(0);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it('a record made after the envelope was sent is rejected at once, not hung', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) => {
          const first = await read(item, batch);
          if (item !== 'ITEM_B') return first;
          // Needs the first answer: belongs in a later phase.
          return read(`${item}_AGAIN`, batch);
        }),
      );
      expect(fake.envelopes).toHaveLength(1);
      expect(results[0]?.ok).toBe(true);
      expect(results[2]?.ok).toBe(true);
      const late = results[1] as { ok: false; error: Error };
      expect(late.ok).toBe(false);
      expect(late.error.message).toBe(LATE_RECORD_WORDS);
    });

    it('a phase that would send more than one envelope fails every item with the fixed error', async () => {
      const fake = answered();
      const results = await withinTurns(
        runPhase(contextOn(fake.connection), ITEMS, async (item, batch) =>
          item === 'ITEM_C'
            ? (
                await batch.makeAdtRequest<string>({
                  url: '/sap/bc/adt/probe/item_c?_action=LOCK',
                  method: 'POST',
                  timeout: 0,
                  headers: { 'X-sap-adt-sessiontype': 'stateful' },
                })
              ).data
            : read(item, batch),
        ),
      );
      expect(fake.envelopes).toHaveLength(1);
      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.ok).toBe(false);
        expect((result as { error: Error }).error.message).toBe(
          MORE_ENVELOPES_WORDS,
        );
      }
    });
  });
});
