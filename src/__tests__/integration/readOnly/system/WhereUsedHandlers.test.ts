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

import { handleGetWhereUsed } from '../../../../handlers/system/readonly/handleGetWhereUsed';
import { getTimeout } from '../../helpers/configHelpers';
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

  beforeAll(async () => {
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
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // Final cleanup - connection closed by tester
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  it(
    'should find where-used references with default scope',
    async () => {
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

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const data = extractResultData(result);
        expect(data.object_name).toBe(testClass);
        expect(data.object_type).toBe('class');
        expect(data.enable_all_types).toBe(false);
        expect(data.total_references).toBeGreaterThanOrEqual(0);

        logger?.info(
          `✅ Found ${data.total_references} references with default scope`,
        );
      });
    },
    getTimeout('long'),
  );

  it(
    'should find where-used references with all types enabled',
    async () => {
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

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const data = extractResultData(result);
        expect(data.object_name).toBe(testClass);
        expect(data.object_type).toBe('class');
        expect(data.enable_all_types).toBe(true);
        expect(data.total_references).toBeGreaterThanOrEqual(0);

        logger?.info(
          `✅ Found ${data.total_references} references with all types enabled`,
        );
      });
    },
    getTimeout('long'),
  );

  it(
    'should find where-used references for a table',
    async () => {
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

        expect(result.isError).toBe(false);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const data = extractResultData(result);
        expect(data.object_name).toBe(testTable);
        expect(data.object_type).toBe('table');
        expect(data.total_references).toBeGreaterThanOrEqual(0);

        logger?.info(`✅ Found ${data.total_references} references for table`);
      });
    },
    getTimeout('long'),
  );

  it(
    'should handle missing object name error',
    async () => {
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

        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const textContent = result.content.find(
          (c: any) => c.type === 'text',
        ) as any;
        expect(textContent).toBeDefined();
        expect(textContent?.text).toContain('Object name is required');

        logger?.info('✅ Error handling validated: missing object name');
      });
    },
    getTimeout('default'),
  );

  it(
    'should handle missing object type error',
    async () => {
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

        expect(result.isError).toBe(true);
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        const textContent = result.content.find(
          (c: any) => c.type === 'text',
        ) as any;
        expect(textContent).toBeDefined();
        expect(textContent?.text).toContain('Object type is required');

        logger?.info('✅ Error handling validated: missing object type');
      });
    },
    getTimeout('default'),
  );

  it(
    'should compare results between default and all-types scope',
    async () => {
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
        expect(allTypesData.total_references).toBeGreaterThanOrEqual(
          defaultData.total_references,
        );

        const difference =
          allTypesData.total_references - defaultData.total_references;
        logger?.info(
          `✅ Difference: ${difference} additional references with all types enabled`,
        );
      });
    },
    getTimeout('long'),
  );
});
