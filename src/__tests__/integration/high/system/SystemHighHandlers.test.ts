/**
 * Integration tests for System High-Level Handlers
 *
 * Tests high-level handlers for system operations:
 * - GetPackageTree - Retrieve complete package tree structure
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true     - Library logs
 *   DEBUG_CONNECTORS=true   - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/high/system
 */

import { handleGetPackageTree } from '../../../../handlers/system/high/handleGetPackageTree';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

describe('System High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('system-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'system_high_handlers',
      'test_system_high',
      'system-high',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Setup - connection already created in tester
        logger?.info('🔧 System high-level handlers test setup complete');
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

  describe('GetPackageTree', () => {
    it(
      'should fetch package tree without subpackages',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetPackageTree without subpackages');
          logger?.info(`📋 Package: ${testPackage}`);

          const handlerContext = createHandlerContext({ connection, logger });
          const result = await handleGetPackageTree(handlerContext, {
            package_name: testPackage,
            include_subpackages: false,
            max_depth: 0,
            include_descriptions: true,
          });

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          // Parse response
          const textContent = result.content.find(
            (c: any) => c.type === 'text',
          ) as any;
          expect(textContent).toBeDefined();

          const responseData = JSON.parse(textContent.text);
          expect(responseData.package_name).toBe(testPackage.toUpperCase());
          expect(responseData.tree).toBeDefined();
          expect(responseData.tree.name).toBe(testPackage.toUpperCase());
          expect(responseData.tree.adtType).toBe('DEVC/K');
          expect(responseData.tree.type).toBe('package');
          expect(responseData.tree.is_package).toBe(true);

          logger?.info('✅ Package tree fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should fetch package tree with subpackages',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetPackageTree with subpackages');
          logger?.info(`📋 Package: ${testPackage}`);

          const handlerContext = createHandlerContext({ connection, logger });
          const result = await handleGetPackageTree(handlerContext, {
            package_name: testPackage,
            include_subpackages: true,
            max_depth: 2,
            include_descriptions: true,
          });

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          // Parse response
          const textContent = result.content.find(
            (c: any) => c.type === 'text',
          ) as any;
          expect(textContent).toBeDefined();

          const responseData = JSON.parse(textContent.text);
          expect(responseData.package_name).toBe(testPackage.toUpperCase());
          expect(responseData.tree).toBeDefined();
          expect(responseData.tree.name).toBe(testPackage.toUpperCase());
          expect(responseData.tree.adtType).toBe('DEVC/K');
          expect(responseData.tree.type).toBe('package');
          expect(responseData.tree.is_package).toBe(true);
          expect(responseData.metadata.include_subpackages).toBe(true);
          expect(responseData.metadata.max_depth).toBe(2);

          logger?.info('✅ Package tree with subpackages fetched successfully');
        });
      },
      getTimeout('long'),
    );

    it(
      'should fetch package tree with limited depth',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection, params } = context;
          if (!params?.test_package) {
            throw new Error(
              'test_package parameter is required in test configuration',
            );
          }
          const testPackage = params.test_package;

          logger?.info('🔍 Testing GetPackageTree with limited depth');
          logger?.info(`📋 Package: ${testPackage}, Max depth: 1`);

          const handlerContext = createHandlerContext({ connection, logger });
          const result = await handleGetPackageTree(handlerContext, {
            package_name: testPackage,
            include_subpackages: true,
            max_depth: 1,
            include_descriptions: false,
          });

          expect(result.isError).toBe(false);
          expect(result.content).toBeDefined();

          // Parse response
          const textContent = result.content.find(
            (c: any) => c.type === 'text',
          ) as any;
          expect(textContent).toBeDefined();

          const responseData = JSON.parse(textContent.text);
          expect(responseData.metadata.max_depth).toBe(1);
          expect(responseData.metadata.include_descriptions).toBe(false);

          logger?.info('✅ Package tree with limited depth fetched');
        });
      },
      getTimeout('long'),
    );

    it(
      'should handle missing package_name error',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection } = context;

          logger?.info('🔍 Testing error handling: missing package_name');

          const handlerContext = createHandlerContext({ connection, logger });
          const result = await handleGetPackageTree(handlerContext, {
            package_name: '',
          });

          expect(result.isError).toBe(true);
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const textContent = result.content.find(
            (c: any) => c.type === 'text',
          ) as any;
          expect(textContent).toBeDefined();
          expect(textContent?.text).toContain('package_name is required');

          logger?.info('✅ Error handling validated: missing package_name');
        });
      },
      getTimeout('default'),
    );

    it(
      'should handle invalid package name error',
      async () => {
        await tester.run(async (context: LambdaTesterContext) => {
          const { connection } = context;

          logger?.info('🔍 Testing error handling: invalid package name');

          const handlerContext = createHandlerContext({ connection, logger });
          const result = await handleGetPackageTree(handlerContext, {
            package_name: 'INVALID_PACKAGE_XYZ_123',
          });

          // Should either return error or empty tree
          if (result.isError) {
            expect(result.content).toBeDefined();
            logger?.info('✅ Error returned for invalid package (expected)');
          } else {
            // If no error, tree should exist but might be empty
            const textContent = result.content.find(
              (c: any) => c.type === 'text',
            ) as any;
            expect(textContent).toBeDefined();
            logger?.info(
              '✅ Empty tree returned for invalid package (expected)',
            );
          }
        });
      },
      getTimeout('long'),
    );
  });
});
