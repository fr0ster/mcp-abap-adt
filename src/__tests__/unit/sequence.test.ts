import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../lib/answer';
import { writeProjection } from '../../lib/strategies/promised';
import { pair, sequence } from '../../lib/strategies/sequence';

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
          writeProjection,
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
      (value) => writeProjection(value, 200),
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
