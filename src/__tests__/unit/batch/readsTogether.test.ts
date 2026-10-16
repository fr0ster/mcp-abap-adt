/**
 * The reads that send a source and its metadata (or two versions) together
 * — `both()` in place of `pair()` — so a batch can record both requests: the
 * answer each tool gives is the one `pair()` gave, answered with a document
 * and with a `404`; held open, both requests are out, where `pair()` sent one.
 */

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

const VERSION_FROM =
  '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';
const VERSION_TO = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00002';

const TOGETHER: BatchEntryCase[] = [
  { tool: 'ReadClass', args: { class_name: 'CLAS_A' } },
  { tool: 'ReadInterface', args: { interface_name: 'INTF_A' } },
  { tool: 'ReadProgram', args: { program_name: 'PROG_A' } },
  { tool: 'ReadTable', args: { table_name: 'TAB_A' } },
  { tool: 'ReadStructure', args: { structure_name: 'STRU_A' } },
  { tool: 'ReadDdl', args: { ddl_name: 'DDL_A' } },
  {
    tool: 'ReadServiceDefinition',
    args: { service_definition_name: 'SRVD_A' },
  },
  { tool: 'ReadServiceBinding', args: { service_binding_name: 'SRVB_A' } },
  {
    tool: 'ReadMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
  },
  {
    tool: 'ReadBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
  },
  {
    tool: 'ReadBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
  },
  {
    tool: 'ReadFunctionInclude',
    args: { function_group_name: 'FUGR_A', include_name: 'INCL_A' },
  },
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
});
