/**
 * Integration tests for System Low-Level Handlers
 *
 * Tests low-level handlers for system operations:
 * - GetVirtualFoldersLow - Retrieve virtual folder contents
 * - GetNodeStructureLow - Fetch node structure from ADT repository
 * - GetObjectStructureLow - Retrieve object structure as compact tree
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true    - Library logs
 *   DEBUG_CONNECTORS=true   - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/low/system
 */

import { handleGetNodeStructure } from '../../../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectStructure } from '../../../../handlers/system/low/handleGetObjectStructure';
import { handleGetVirtualFolders } from '../../../../handlers/system/low/handleGetVirtualFolders';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

describe('System Low-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('system-low');

  beforeAll(async () => {
    tester = new LambdaTester(
      'system_low_handlers',
      'test_system_low',
      'system-low',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Setup - connection already created in tester
        logger?.info('🔧 System low-level handlers test setup complete');
      },
      async (_context: LambdaTesterContext) => {
        // Cleanup lambda - no cleanup needed for read-only handlers
        logger?.info('🧹 No cleanup needed for read-only handlers');
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // Final cleanup - connection closed by tester
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  describe('GetVirtualFoldersLow', () => {
    it(
      'should fetch virtual folders contents with default pattern',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetVirtualFoldersLow with default pattern');
          logger?.info(`📋 Package: ${testPackage}`);

          const result = await tester.invokeToolOrHandler(
            'GetVirtualFoldersLow',
            {
              object_search_pattern: '*',
              preselection: [
                {
                  facet: 'package',
                  values: [testPackage],
                },
              ],
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetVirtualFolders(handlerContext, {
                object_search_pattern: '*',
                preselection: [
                  {
                    facet: 'package',
                    values: [testPackage],
                  },
                ],
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          logger?.info('✅ Virtual folders contents fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should fetch virtual folders with custom search pattern',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection } = context;

          logger?.info('🔍 Testing GetVirtualFoldersLow with custom pattern');
          logger?.info('📋 Pattern: Z*');

          const result = await tester.invokeToolOrHandler(
            'GetVirtualFoldersLow',
            {
              object_search_pattern: 'Z*',
              facet_order: ['package', 'type'],
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetVirtualFolders(handlerContext, {
                object_search_pattern: 'Z*',
                facet_order: ['package', 'type'],
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          logger?.info('✅ Virtual folders with custom pattern fetched');
        });
      },
      getTimeout('long'),
    );
  });

  describe('GetNodeStructureLow', () => {
    it(
      'should fetch node structure for a package',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetNodeStructureLow for package');
          logger?.info(`📋 Package: ${testPackage}`);

          const result = await tester.invokeToolOrHandler(
            'GetNodeStructureLow',
            {
              parent_type: 'DEVC/K',
              parent_name: testPackage,
              node_id: '0000',
              with_short_descriptions: true,
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetNodeStructure(handlerContext, {
                parent_type: 'DEVC/K',
                parent_name: testPackage,
                node_id: '0000',
                with_short_descriptions: true,
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          logger?.info('✅ Node structure fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should fetch node structure for a class',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_class) {
            throw new Error(
              'test_class parameter is required in test configuration',
            );
          }
          const testClass = params.test_class;

          logger?.info('🔍 Testing GetNodeStructureLow for class');
          logger?.info(`📋 Class: ${testClass}`);

          const result = await tester.invokeToolOrHandler(
            'GetNodeStructureLow',
            {
              parent_type: 'CLAS/OC',
              parent_name: testClass,
              node_id: '0000',
              with_short_descriptions: true,
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetNodeStructure(handlerContext, {
                parent_type: 'CLAS/OC',
                parent_name: testClass,
                node_id: '0000',
                with_short_descriptions: true,
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          logger?.info('✅ Node structure for class fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should handle missing parent_type error',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection } = context;

          logger?.info('🔍 Testing error handling: missing parent_type');

          const result = await tester.invokeToolOrHandler(
            'GetNodeStructureLow',
            {
              parent_type: '',
              parent_name: 'TEST',
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetNodeStructure(handlerContext, {
                parent_type: '',
                parent_name: 'TEST',
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
          expect(textContent?.text).toContain('parent_type is required');

          logger?.info('✅ Error handling validated: missing parent_type');
        });
      },
      getTimeout('default'),
    );
  });

  describe('GetObjectStructureLow', () => {
    it(
      'should fetch object structure for a package',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetObjectStructureLow for package');
          logger?.info(`📋 Package: ${testPackage}`);

          const result = await tester.invokeToolOrHandler(
            'GetObjectStructureLow',
            {
              object_type: 'DEVC/K',
              object_name: testPackage,
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetObjectStructure(handlerContext, {
                object_type: 'DEVC/K',
                object_name: testPackage,
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          logger?.info('✅ Object structure fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should fetch object structure for a class',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_class) {
            throw new Error(
              'test_class parameter is required in test configuration',
            );
          }
          const testClass = params.test_class;

          logger?.info('🔍 Testing GetObjectStructureLow for class');
          logger?.info(`📋 Class: ${testClass}`);

          const result = await tester.invokeToolOrHandler(
            'GetObjectStructureLow',
            {
              object_type: 'CLAS/OC',
              object_name: testClass,
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetObjectStructure(handlerContext, {
                object_type: 'CLAS/OC',
                object_name: testClass,
              });
            },
          );

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          logger?.info('✅ Object structure for class fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should handle missing object_type error',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection } = context;

          logger?.info('🔍 Testing error handling: missing object_type');

          const result = await tester.invokeToolOrHandler(
            'GetObjectStructureLow',
            {
              object_type: '',
              object_name: 'TEST',
            },
            async () => {
              const handlerContext = createHandlerContext({ connection, logger });
              return handleGetObjectStructure(handlerContext, {
                object_type: '',
                object_name: 'TEST',
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
          expect(textContent?.text).toContain('object_type is required');

          logger?.info('✅ Error handling validated: missing object_type');
        });
      },
      getTimeout('default'),
    );
  });
});
