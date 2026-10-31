/**
 * The reads that send two versions together — `both()` in place of
 * `pair()` — so a batch can record both requests: the
 * answer each tool gives is the one `pair()` gave, answered with a document
 * and with a `404`; held open, both requests are out, where `pair()` sent one.
 */

import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import { failureOf } from '../../../lib/auth/failures';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import * as sequenceModule from '../../../lib/strategies/sequence';
import { both, pair } from '../../../lib/strategies/sequence';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import type { BatchEntryCase } from '../../helpers/batchEntryCases';
import { runCase, servedTools } from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const VERSION_FROM =
  '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';
const VERSION_TO = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00002';

const TOGETHER: BatchEntryCase[] = [
  {
    tool: 'GetObjectVersionDiff',
    args: {
      object_type: 'class',
      content_uri_from: VERSION_FROM,
      content_uri_to: VERSION_TO,
    },
  },
];

describe('reads whose two requests go out together', () => {
  const context = {
    connection: undefined,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = servedTools(context);

  beforeEach(() =>
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    }),
  );
  afterEach(() => {
    jest.restoreAllMocks();
    resetSystemContextCache();
  });

  /** `both` as `pair` was: the second request only after the first answer. */
  const asPair = () =>
    jest
      .spyOn(sequenceModule, 'both')
      .mockImplementation((first, second) => pair(first, () => second()));

  it.each(TOGETHER.map((c) => [c.tool, c] as const))(
    '%s: answers as with pair(), and sends both requests before any answer',
    async (_tool, c) => {
      const held = await runCase(tools, context, c, 'pending');
      const documented = await runCase(tools, context, c, 'document');
      const refused = await runCase(tools, context, c, 'not-found');
      asPair();
      const heldBefore = await runCase(tools, context, c, 'pending');
      const documentedBefore = await runCase(tools, context, c, 'document');
      const refusedBefore = await runCase(tools, context, c, 'not-found');

      expect(held.sent).toHaveLength(2);
      expect(heldBefore.sent).toHaveLength(1);
      expect(documented.answer).toEqual(documentedBefore.answer);
      expect(documented.sent).toEqual(documentedBefore.sent);
      expect(refused.answer).toEqual(refusedBefore.answer);
    },
  );
});

describe('both()', () => {
  type R<T> =
    sequenceModule.Step<unknown, T> extends (p: unknown) => Promise<infer X>
      ? X
      : never;
  const ok = <T>(value: T) =>
    sequenceModule.succeededWith(value) as unknown as R<T>;
  const no = (message: string) =>
    sequenceModule.failedWith({ message } as never) as unknown as R<never>;

  it('sends the second request before the first is answered', async () => {
    const order: string[] = [];
    let answerFirst: (v: R<string>) => void = () => {};
    const result = both(
      () => {
        order.push('first sent');
        return new Promise<R<string>>((r) => {
          answerFirst = r;
        });
      },
      async () => {
        order.push('second sent');
        return ok('b');
      },
    );
    await Promise.resolve();
    expect(order).toEqual(['first sent', 'second sent']);
    answerFirst(ok('a'));
    const answered = await result;
    expect(answered.ok && answered.getResult().value).toEqual(['a', 'b']);
  });

  it("answers the first failure as it came, the first's before the second's", async () => {
    const firstFails = no('first');
    expect(
      await both(
        async () => firstFails,
        async () => no('second'),
      ),
    ).toBe(firstFails);
    const secondFails = no('second');
    expect(
      await both(
        async () => ok('a'),
        async () => secondFails,
      ),
    ).toBe(secondFails);
  });

  it('rejects as pair() does, and leaves no rejection unhandled', async () => {
    const thrown = new Error('first threw');
    await expect(
      both(
        async () => {
          throw thrown;
        },
        async () => {
          throw new Error('second threw');
        },
      ),
    ).rejects.toBe(thrown);
    const failed = no('first');
    expect(
      await both(
        async () => failed,
        async () => {
          throw new Error('second threw');
        },
      ),
    ).toBe(failed);
  });

  /** A second request held open until `release()`, and whether `both()` has settled. */
  function heldSecond() {
    let release: () => void = () => {};
    const second = () =>
      new Promise<R<string>>((resolve) => {
        release = () => resolve(ok('b'));
      });
    return { second, release: () => release() };
  }
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((r) => setImmediate(r));
    }
  };

  it('does not settle on a failed first answer while the second request is in flight', async () => {
    const held = heldSecond();
    const failed = no('first');
    let settled = false;
    const result = both(async () => failed, held.second).then((v) => {
      settled = true;
      return v;
    });
    await flush();
    expect(settled).toBe(false);
    held.release();
    expect(await result).toBe(failed);
    expect(settled).toBe(true);
  });

  it('does not settle on a rejected first call while the second request is in flight', async () => {
    const held = heldSecond();
    const thrown = new Error('first threw');
    let settled = false;
    const result = both(async () => {
      throw thrown;
    }, held.second).then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        throw error;
      },
    );
    const rejected = expect(result).rejects.toBe(thrown);
    await flush();
    expect(settled).toBe(false);
    held.release();
    await rejected;
    expect(settled).toBe(true);
  });

  it('a credential refusal ends the call as it came, in either position', async () => {
    const refusal = () =>
      new AuthProviderFailure(
        authError['credential-refused']({ credential: 'token' }),
      );
    // The first rejects with it: the call rejects with that very value.
    const first = refusal();
    const asFirst = both(
      async () => {
        throw first;
      },
      async () => ok('b'),
    );
    await expect(asFirst).rejects.toBe(first);
    await asFirst.catch((thrown) =>
      expect(failureOf(thrown)).toEqual(failureOf(refusal())),
    );
    // The first answers, the second rejects with it: the same.
    const second = refusal();
    const asSecond = both(
      async () => ok('a'),
      async () => {
        throw second;
      },
    );
    await expect(asSecond).rejects.toBe(second);
    await asSecond.catch((thrown) =>
      expect(failureOf(thrown)).toEqual(failureOf(refusal())),
    );
    expect(failureOf(second)).toBeDefined();
  });
});
