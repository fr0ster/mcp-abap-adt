/**
 * Integration tests for WhereUsed Handler
 *
 * Tests the GetWhereUsed handler with two-step workflow:
 * - Default scope (SAP default selections)
 * - Enable all types (Eclipse "select all" behavior)
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/system/WhereUsedHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import * as z from 'zod';
import { handleGetWhereUsed } from '../../../../handlers/system/readonly/handleGetWhereUsed';
import type { McpResult } from '../../../../lib/answer';
import { assertEquals } from '../../helpers/liveAssert';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { servedSuite } from '../../helpers/servedHere';
import {
  type FullWhereUsedReference,
  headOf,
  terseOf,
  terseText,
  whereUsedRows,
  whereUsedTerseMismatches,
} from '../../helpers/terseAnswer';
import { readCaseParams } from '../../helpers/testConfigSchema';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/** What this file's cases state, as its tests read them. */
const WhereUsedParams = z.looseObject({
  test_class: z.string().optional(),
  test_table: z.string().optional(),
});

/**
 * The reference total of GetWhereUsed's terse answer (the default): its
 * `# total N` head; its rows read by the header's column names, and, with
 * `full` (the same call at `detail: 'full'`), compared with it.
 */
function terseTotal(
  result: Parameters<typeof terseText>[0],
  full?: McpResult,
): number {
  const answer = terseOf(terseText(result));
  const shown = answer.text.slice(0, 2000);
  const total = Number(headOf(answer, 'total'));
  assert.ok(Number.isFinite(total), shown);
  // The usages SAP answered, as rows under their package: each a type, a
  // name, the element it is in and a usage, wherever the header puts them.
  for (const column of ['type', 'name', 'element', 'usage']) {
    assert.ok(answer.columns.includes(column), shown);
  }
  if (total > 0) assert.ok(answer.rows.length > 0, shown);
  // Every usage full resolves is a terse row by its real type and name — a
  // usage inside a method or section by the object it is in, the element
  // beside it; one full leaves unresolved is a row by its URI.
  if (full !== undefined) {
    assert.deepStrictEqual(
      whereUsedTerseMismatches(answer, fullReferences(full)),
      [],
      shown,
    );
  }
  return total;
}

/** The references of GetWhereUsed's `full` answer: its text, parsed. */
function fullReferences(full: McpResult): FullWhereUsedReference[] {
  const parsed: { references?: FullWhereUsedReference[] } = JSON.parse(
    terseText(full),
  );
  return parsed.references ?? [];
}

/** GetWhereUsed's `full` answer: the fields these cases read. */
interface FullAnswer {
  total_references: number;
  enable_only_types?: string[];
  references?: FullWhereUsedReference[];
}

/** A `full` answer's JSON, from its text. */
function extractResultData(
  result: Parameters<typeof terseText>[0],
): FullAnswer {
  const parsed: FullAnswer = JSON.parse(terseText(result));
  return parsed;
}

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite(['GetWhereUsed']);

describe('WhereUsed Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('whereused-test');

  before(async () => {
    tester = new LambdaTester(
      'whereused_readonly',
      'test_whereused',
      'whereused-test',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Setup - connection already created in tester
        logger?.info('🔧 WhereUsed test setup complete');
      },
      async (_context: LambdaTesterContext) => {
        // Cleanup lambda - no cleanup needed for read-only handler
        logger?.info('🧹 No cleanup needed for read-only handler');
      },
    );
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // Final cleanup - connection closed by tester
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  it('should find where-used references with default scope', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';

      logger?.info('🔍 Testing where-used with default scope');
      logger?.info(`📋 Object: ${testClass} (class)`);

      const result = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: false,
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: testClass,
            object_type: 'class',
            enable_all_types: false,
          });
        },
      );

      assert.equal(result.isError, false);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      const full = await handleGetWhereUsed(
        createHandlerContext({ connection, logger }),
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: false,
          detail: 'full',
        },
      );
      const total = terseTotal(result, full);
      assert.ok(total >= 0);

      logger?.info(`✅ Found ${total} references with default scope`);
    });
  });

  // The code lines of one using object: the first object the plain answer
  // names on an `# in` line (a class with usages in its methods), read with
  // in_object — its usages only, each with its method and source line.
  it('in_object answers one using class its usages, each with its code line', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';
      const handlerContext = createHandlerContext({ connection, logger });
      const plain = await handleGetWhereUsed(handlerContext, {
        object_name: testClass,
        object_type: 'class',
      });
      assert.equal(plain.isError, false, terseText(plain).slice(0, 2000));
      const owner = whereUsedRows(terseOf(terseText(plain))).find(
        (row) => row.element !== '' && row.type !== '' && row.name !== '',
      );
      assert.ok(owner, terseText(plain).slice(0, 2000));
      const inObject = {
        object_type: owner.type ?? '',
        object_name: owner.name ?? '',
      };
      const result = await handleGetWhereUsed(handlerContext, {
        object_name: testClass,
        object_type: 'class',
        in_object: inObject,
      });
      const text = terseText(result);
      const shown = text.slice(0, 2000);
      assert.equal(result.isError, false, shown);
      const answer = terseOf(text);
      assert.ok(answer.columns.includes('code'), shown);
      const rows = whereUsedRows(answer);
      assert.ok(rows.length > 0, shown);
      // Every row is a usage inside that object, at its method or section.
      for (const row of rows) {
        assert.deepStrictEqual(
          { type: row.type, name: row.name },
          { type: inObject.object_type, name: inObject.object_name },
          shown,
        );
      }
      // The usages in its code come with the line they are on.
      assert.ok(
        rows.some((row) => (row.code ?? '') !== ''),
        shown,
      );
      // Every row as the same call's full answer implies it: each usage
      // with its element and each of its code lines.
      const full = await handleGetWhereUsed(handlerContext, {
        object_name: testClass,
        object_type: 'class',
        in_object: inObject,
        detail: 'full',
      });
      assert.deepStrictEqual(
        whereUsedTerseMismatches(answer, fullReferences(full)),
        [],
        shown,
      );
      logger?.info(
        `✅ ${inObject.object_type} ${inObject.object_name}: ${rows.length} row(s) with code lines`,
      );
    });
  });

  it('should find where-used references with all types enabled', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';

      logger?.info('🔍 Testing where-used with all types enabled');
      logger?.info(`📋 Object: ${testClass} (class)`);

      const result = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: true,
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: testClass,
            object_type: 'class',
            enable_all_types: true,
          });
        },
      );

      assert.equal(result.isError, false);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      const full = await handleGetWhereUsed(
        createHandlerContext({ connection, logger }),
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: true,
          detail: 'full',
        },
      );
      const total = terseTotal(result, full);
      assert.ok(total >= 0);

      logger?.info(`✅ Found ${total} references with all types enabled`);
    });
  });

  it('should find where-used references for a table', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testTable = params?.test_table || 'SCARR';

      logger?.info('🔍 Testing where-used for table');
      logger?.info(`📋 Object: ${testTable} (table)`);

      const result = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: testTable,
          object_type: 'table',
          enable_all_types: false,
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: testTable,
            object_type: 'table',
            enable_all_types: false,
          });
        },
      );

      assert.equal(result.isError, false);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      const full = await handleGetWhereUsed(
        createHandlerContext({ connection, logger }),
        {
          object_name: testTable,
          object_type: 'table',
          enable_all_types: false,
          detail: 'full',
        },
      );
      const total = terseTotal(result, full);
      assert.ok(total >= 0);

      logger?.info(`✅ Found ${total} references for table`);
    });
  });

  it('should handle missing object name error', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;

      logger?.info('🔍 Testing error handling: missing object name');

      const result = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: '',
          object_type: 'class',
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: '',
            object_type: 'class',
          });
        },
      );

      assert.equal(result.isError, true);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      assert.ok(terseText(result).includes('Object name is required'));

      logger?.info('✅ Error handling validated: missing object name');
    });
  });

  it('should handle missing object type error', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;

      logger?.info('🔍 Testing error handling: missing object type');

      const result = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: 'CL_ABAP_CHAR_UTILITIES',
          object_type: '',
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: 'CL_ABAP_CHAR_UTILITIES',
            object_type: '',
          });
        },
      );

      assert.equal(result.isError, true);
      assert.ok(result.content !== undefined);
      assert.ok(result.content.length > 0);

      assert.ok(terseText(result).includes('Object type is required'));

      logger?.info('✅ Error handling validated: missing object type');
    });
  });

  it('should compare results between default and all-types scope', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';

      logger?.info('🔍 Comparing default scope vs all-types scope');
      logger?.info(`📋 Object: ${testClass} (class)`);

      // Get results with default scope
      const defaultResult = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: false,
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: testClass,
            object_type: 'class',
            enable_all_types: false,
          });
        },
      );
      const defaultData = { total_references: terseTotal(defaultResult) };

      // Get results with all types enabled
      const allTypesResult = await tester.invokeToolOrHandler(
        'GetWhereUsed',
        {
          object_name: testClass,
          object_type: 'class',
          enable_all_types: true,
        },
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleGetWhereUsed(handlerContext, {
            object_name: testClass,
            object_type: 'class',
            enable_all_types: true,
          });
        },
      );
      const allTypesData = { total_references: terseTotal(allTypesResult) };

      // Compare results
      logger?.info(
        `📊 Default scope: ${defaultData.total_references} references`,
      );
      logger?.info(
        `📊 All types scope: ${allTypesData.total_references} references`,
      );

      // All-types scope should have >= references than default (or equal if SAP returns all by default)
      assert.ok(allTypesData.total_references >= defaultData.total_references);

      const difference =
        allTypesData.total_references - defaultData.total_references;
      logger?.info(
        `✅ Difference: ${difference} additional references with all types enabled`,
      );
    });
  });

  it('should restrict results to enable_only_types (server-side type filtering)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection } = context;
      const params = readCaseParams(
        context.params,
        WhereUsedParams,
        'whereused_readonly',
      );
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';

      const invoke = async (
        extra: Pick<
          Parameters<typeof handleGetWhereUsed>[1],
          'enable_all_types' | 'enable_only_types'
        >,
      ) =>
        tester.invokeToolOrHandler(
          'GetWhereUsed',
          // The references' types and the filter echoed: the full answer.
          {
            object_name: testClass,
            object_type: 'class',
            detail: 'full',
            ...extra,
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetWhereUsed(handlerContext, {
              object_name: testClass,
              object_type: 'class',
              detail: 'full',
              ...extra,
            });
          },
        );

      // Baseline: all types — gather the distinct referencing types.
      logger?.info('🔍 Type filtering: ALL types baseline');
      const allResult = await invoke({ enable_all_types: true });
      const allData = extractResultData(allResult);
      const allTypes: string[] = Array.from(
        new Set<string>((allData.references ?? []).map((r) => String(r.type))),
      );
      logger?.info(
        `📊 ALL: ${allData.total_references} refs across [${allTypes.join(', ')}]`,
      );

      if (allData.total_references === 0) {
        logger?.info('⚠️ No references — nothing to filter, skipping asserts');
        return;
      }

      // KEEP: 'CLAS/OC' is a standard searchable scope type for a class's
      // where-used. Narrowing to it must succeed and return no MORE than the
      // baseline; when the baseline spans several types it must return fewer
      // (SAP searched only classes server-side). Note: result `type` codes
      // (e.g. FUGR/F container nodes) are a different vocabulary than the
      // scope selection codes, so we assert on counts, not per-ref types.
      logger?.info('🔍 Type filtering: ONLY [CLAS/OC] (valid scope type)');
      const keptResult = await invoke({ enable_only_types: ['CLAS/OC'] });
      const keptData = extractResultData(keptResult);
      logger?.info(
        `📊 KEEP [CLAS/OC]: ${keptData.total_references} refs (baseline ${allData.total_references})`,
      );
      assert.equal(keptResult.isError, false);
      assertEquals(keptData.enable_only_types, ['CLAS/OC']);
      assert.ok(keptData.total_references <= allData.total_references);
      if (allTypes.length > 1) {
        assert.ok(keptData.total_references < allData.total_references);
      }

      // INVALID: a type that is not in the object's scope must be rejected
      // with an error — never silently fall back to the full default set.
      logger?.info('🔍 Type filtering: ONLY [BOGUS/XX] (must error)');
      const badResult = await invoke({ enable_only_types: ['BOGUS/XX'] });
      const badText = terseText(badResult);
      logger?.info(`📊 INVALID [BOGUS/XX]: isError=${badResult.isError}`);
      assert.equal(badResult.isError, true);
      assert.ok(badText.includes('BOGUS/XX'));
    });
  });
});
