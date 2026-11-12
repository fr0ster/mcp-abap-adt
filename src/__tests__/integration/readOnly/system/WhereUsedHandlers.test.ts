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
 * Run: npm test -- --testPathPattern=integration/readOnly/system/WhereUsed
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { handleGetWhereUsed } from '../../../../handlers/system/readonly/handleGetWhereUsed';

import { assertEquals } from '../../helpers/liveAssert';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

function extractResultData(result: any): any {
  const jsonContent = result.content.find((c: any) => c.type === 'json') as any;
  if (jsonContent?.json) {
    return jsonContent.json;
  }
  const textContent = result.content.find((c: any) => c.type === 'text') as any;
  if (textContent?.text) {
    return JSON.parse(textContent.text);
  }
  throw new Error('No response payload found');
}

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
      const { connection, params } = context;
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

      const data = extractResultData(result);
      assert.equal(data.object_name, testClass);
      assert.equal(data.object_type, 'class');
      assert.equal(data.enable_all_types, false);
      assert.ok(data.total_references >= 0);

      logger?.info(
        `✅ Found ${data.total_references} references with default scope`,
      );
    });
  });

  it('should find where-used references with all types enabled', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
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

      const data = extractResultData(result);
      assert.equal(data.object_name, testClass);
      assert.equal(data.object_type, 'class');
      assert.equal(data.enable_all_types, true);
      assert.ok(data.total_references >= 0);

      logger?.info(
        `✅ Found ${data.total_references} references with all types enabled`,
      );
    });
  });

  it('should find where-used references for a table', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
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

      const data = extractResultData(result);
      assert.equal(data.object_name, testTable);
      assert.equal(data.object_type, 'table');
      assert.ok(data.total_references >= 0);

      logger?.info(`✅ Found ${data.total_references} references for table`);
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

      const textContent = result.content.find(
        (c: any) => c.type === 'text',
      ) as any;
      assert.ok(textContent !== undefined);
      assert.ok(textContent?.text.includes('Object name is required'));

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

      const textContent = result.content.find(
        (c: any) => c.type === 'text',
      ) as any;
      assert.ok(textContent !== undefined);
      assert.ok(textContent?.text.includes('Object type is required'));

      logger?.info('✅ Error handling validated: missing object type');
    });
  });

  it('should compare results between default and all-types scope', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
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
      const defaultData = extractResultData(defaultResult);

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
      const allTypesData = extractResultData(allTypesResult);

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
      const { connection, params } = context;
      const testClass = params?.test_class || 'CL_ABAP_CHAR_UTILITIES';

      const invoke = async (extra: Record<string, unknown>) =>
        tester.invokeToolOrHandler(
          'GetWhereUsed',
          { object_name: testClass, object_type: 'class', ...extra },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetWhereUsed(handlerContext, {
              object_name: testClass,
              object_type: 'class',
              ...extra,
            } as any);
          },
        );

      // Baseline: all types — gather the distinct referencing types.
      logger?.info('🔍 Type filtering: ALL types baseline');
      const allResult = await invoke({ enable_all_types: true });
      const allData = extractResultData(allResult);
      const allTypes: string[] = Array.from(
        new Set<string>(
          (allData.references || []).map((r: any) => String(r.type)),
        ),
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
      const badText =
        (badResult.content.find((c: any) => c.type === 'text') as any)?.text ||
        '';
      logger?.info(`📊 INVALID [BOGUS/XX]: isError=${badResult.isError}`);
      assert.equal(badResult.isError, true);
      assert.ok(badText.includes('BOGUS/XX'));
    });
  });
});
