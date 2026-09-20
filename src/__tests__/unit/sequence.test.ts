import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../lib/answer';
import { writeProjection } from '../../lib/strategies/promised';
import { pair, sequence } from '../../lib/strategies/sequence';

/**
 * `writeProjection` is `Terse<unknown>` — `(value, status)`, same as
 * `terseWrite` — and `answer()`'s `project` takes one parameter. A real call
 * site bridges the two with `project(detail, terseWrite)`, reading `status`
 * off the `AdtReading` a result strategy produced (see `resultSets.ts` and
 * `src/handlers/domain/low`). These tests exercise `sequence` and `answer`
 * with plain values that never went through a reading, so the status is
 * supplied here instead — 200, because these are the tests' own successes,
 * never a number read off the wire.
 */
const projectWrite = (value: unknown) => writeProjection(value, 200);

function ok<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/** A failure exactly as an analyse strategy would have built it. */
function refused(message: string, extra: Partial<IAdtError> = {}) {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => ({ origin: 'refusal', message, ...extra }),
  } as unknown as IAdtResponse<never, IAdtError>;
}

describe('a sequence keeps the strategies in charge', () => {
  it('runs the steps in order and answers the last', async () => {
    const seen: string[] = [];
    const result = await sequence(
      async () => {
        seen.push('read');
        return ok('<doma:domain/>');
      },
      async (document) => {
        seen.push(`write:${document}`);
        return ok('written');
      },
    );
    expect(seen).toEqual(['read', 'write:<doma:domain/>']);
    expect(result.ok).toBe(true);
  });

  it('stops at the first failure and does not run what follows', async () => {
    let wrote = false;
    const result = await sequence(
      async () => refused('Resource CLASS X does not exist.'),
      async () => {
        wrote = true;
        return ok('written');
      },
    );
    expect(wrote).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("hands back the failing step's own answer, untouched", async () => {
    // The point: no sentence of the sequence's own beside the strategy's.
    const built = {
      origin: 'refusal' as const,
      message: 'Resource CLASS ZX is not locked',
      adtType: 'ExceptionResourceInvalidLockHandle',
      messages: [
        {
          type: 'E',
          text: 'Resource CLASS ZX is not locked',
          t100: { id: 'SADT_RESOURCE', no: '026' },
        },
      ],
    };
    const result = await sequence(
      async () => ok('<doma:domain/>'),
      async () => refused(built.message, built),
    );
    expect(result.ok).toBe(false);
    expect((result as { getError: () => unknown }).getError()).toEqual(built);
  });

  it('carries that failure through the adapter with everything on it', async () => {
    const payload = JSON.parse(
      (
        await answer(
          { tool: 'UpdateDomain', detail: 'terse' },
          () =>
            sequence(
              async () => ok('<doma:domain/>'),
              async () =>
                refused('Resource CLASS ZX is not locked', {
                  origin: 'refusal',
                  adtType: 'ExceptionResourceInvalidLockHandle',
                  messages: [
                    {
                      type: 'E',
                      text: 'Resource CLASS ZX is not locked',
                      t100: { id: 'SADT_RESOURCE', no: '026' },
                    },
                  ],
                } as never),
            ),
          projectWrite,
        )
      ).content[0].text,
    );
    expect(payload.origin).toBe('refusal');
    expect(payload.adt_type).toBe('ExceptionResourceInvalidLockHandle');
    expect(payload.messages[0].t100).toEqual({
      id: 'SADT_RESOURCE',
      no: '026',
    });
  });

  it('a sequence that succeeds still answers through the result projection', async () => {
    const result = await answer(
      { tool: 'UpdateDomain', detail: 'terse' },
      () =>
        sequence(
          async () => ok('<doma:domain/>'),
          async () => ok(undefined),
        ),
      projectWrite,
    );
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('SUCCESS');
  });

  it('runs three steps as readily as two', async () => {
    const result = await sequence(
      async () => ok(1),
      async (n) => ok(n + 1),
      async (n) => ok(n + 1),
    );
    expect(
      (result as { getResult: () => { value: number } }).getResult().value,
    ).toBe(3);
  });
});

describe('pair', () => {
  it('answers both values when both steps succeed', async () => {
    const result = await pair(
      async () => ok('source') as never,
      async () => ok('meta') as never,
    );
    if (!result.ok) throw new Error('expected both values');
    expect(result.getResult().value).toEqual(['source', 'meta']);
  });

  it('hands back the first failure untouched, and never calls the second step', async () => {
    const second = jest.fn();
    const result = await pair(
      async () => refused('read refused') as never,
      second as never,
    );
    if (result.ok) throw new Error('expected the read refusal');
    expect(result.getError().message).toBe('read refused');
    expect(second).not.toHaveBeenCalled();
  });

  it('hands back the second failure untouched', async () => {
    const result = await pair(
      async () => ok('source') as never,
      async () => refused('meta refused') as never,
    );
    if (result.ok) throw new Error('expected the metadata refusal');
    expect(result.getError().message).toBe('meta refused');
  });
});

describe('sequence, at four and five steps', () => {
  it('runs all five in order and answers the last', async () => {
    const order: string[] = [];
    const step = (name: string) => async () => {
      order.push(name);
      return ok(name) as never;
    };
    const result = await sequence(
      step('validate'),
      step('create'),
      step('write'),
      step('check'),
      step('activate'),
    );
    expect(order).toEqual(['validate', 'create', 'write', 'check', 'activate']);
    if (!result.ok) throw new Error('expected all five to run');
    expect(result.getResult().value).toBe('activate');
  });

  it('stops at the fourth and never reaches the fifth', async () => {
    const fifth = jest.fn();
    const step = (name: string) => async () => ok(name) as never;
    const result = await sequence(
      step('validate'),
      step('create'),
      step('write'),
      async () => refused('Check refused') as never,
      fifth as never,
    );
    if (result.ok) throw new Error('expected the check refusal');
    expect(result.getError().message).toBe('Check refused');
    expect(fifth).not.toHaveBeenCalled();
  });
});

/**
 * A lifecycle create runs its `withLock` write as one step of a sequence, and
 * the check that follows answers in its place. The note about a lock nobody
 * released rode on the write's answer, so it was gone one step before the
 * handler could carry it to the caller — `carryCleanup` at the end of
 * `handleCreateDomain` had nothing left to move.
 *
 * So the carrying happens between the steps too. Only the note travels: the
 * answer is still entirely the last step's.
 */
describe('a sequence carries a held lock past the step that answers next', () => {
  const held = { message: 'Unlock refused', origin: 'refusal' as const };

  const holding = <T>(value: T): IAdtResponse<T, IAdtError> =>
    ({ ...ok(value), cleanup: held }) as unknown as IAdtResponse<T, IAdtError>;

  it('carries it onto a later step that succeeded', async () => {
    const result = await sequence(
      async () => holding('written'),
      async () => ok('checked'),
    );
    if (!result.ok) throw new Error('expected the check to stand');
    expect(result.getResult().value).toBe('checked');
    expect((result as { cleanup?: unknown }).cleanup).toEqual(held);
  });

  it('carries it onto a later step that refused, error untouched', async () => {
    const result = await sequence(
      async () => holding('written'),
      async () => refused('Check refused'),
    );
    if (result.ok) throw new Error('expected the check refusal');
    const error = result.getError() as IAdtError & { cleanup?: unknown };
    expect(error.message).toBe('Check refused');
    expect(error.cleanup).toEqual(held);
  });

  it('carries it across every step that follows, not just the next one', async () => {
    const result = await sequence(
      async () => holding('written'),
      async () => ok('checked'),
      async () => ok('read back'),
    );
    if (!result.ok) throw new Error('expected the last step to stand');
    expect(result.getResult().value).toBe('read back');
    expect((result as { cleanup?: unknown }).cleanup).toEqual(held);
  });

  it('leaves an answer alone when no step held anything', async () => {
    const result = await sequence(
      async () => ok('written'),
      async () => ok('checked'),
    );
    expect((result as { cleanup?: unknown }).cleanup).toBeUndefined();
  });

  it('keeps it through a pair, which builds its answer from scratch', async () => {
    const result = await pair(
      async () => holding('document'),
      async () => ok('metadata'),
    );
    if (!result.ok) throw new Error('expected both answers');
    expect(result.getResult().value).toEqual(['document', 'metadata']);
    expect((result as { cleanup?: unknown }).cleanup).toEqual(held);
  });
});
