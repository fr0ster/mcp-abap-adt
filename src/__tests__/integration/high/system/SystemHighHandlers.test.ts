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

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as z from 'zod';
import { handleGetPackageTree } from '../../../../handlers/system/high/handleGetPackageTree';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { readCaseParams } from '../../helpers/testConfigSchema';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

/** What this file's cases state, as its tests read them. */
const SystemParams = z.looseObject({
  test_package: z.string().optional(),
});

describe('System High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('system-high');

  before(async () => {
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
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      // Final cleanup - connection closed by tester
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  describe('GetPackageTree', () => {
    it('should fetch package tree without subpackages', async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;
        const params = readCaseParams(
          context.params,
          SystemParams,
          'system_high_handlers',
        );
        if (!params?.test_package) {
          throw new Error(
            'test_package parameter is required in test configuration',
          );
        }
        const testPackage = params.test_package;

        logger?.info('🔍 Testing GetPackageTree without subpackages');
        logger?.info(`📋 Package: ${testPackage}`);

        const result = await tester.invokeToolOrHandler(
          'GetPackageTree',
          {
            package_name: testPackage,
            include_subpackages: false,
            max_depth: 0,
            include_descriptions: true,
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetPackageTree(handlerContext, {
              package_name: testPackage,
              include_subpackages: false,
              max_depth: 0,
              include_descriptions: true,
            });
          },
        );

        assert.equal(result.isError, false);
        assert.ok(result.content !== undefined);
        assert.ok(result.content.length > 0);

        // Parse response
        const textContent = result.content.find(
          (c: any) => c.type === 'text',
        ) as any;
        assert.ok(textContent !== undefined);

        const responseData = JSON.parse(textContent.text);
        assert.equal(responseData.package_name, testPackage.toUpperCase());
        assert.ok(responseData.tree !== undefined);
        assert.equal(responseData.tree.name, testPackage.toUpperCase());
        // The node's own field names, not a snake_case rewrite of them.
        // `adtType`/`is_package`/`type: 'package'` came from a client older
        // than 18: `IPackageHierarchyNode` at tag `v18.0.2`
        // (`src/core/shared/utilResults.ts:113`, extending `IAdtObjectHit`
        // at `:25`) already answered `name`, `type` — the ADT type code —
        // `kind` and `isPackage`, which is exactly what `assembleTree`
        // builds today. So this is a stale assertion against a shape that
        // predates the migration, not a contract the migration moved.
        assert.equal(responseData.tree.type, 'DEVC/K');
        assert.equal(responseData.tree.kind, 'package');
        assert.equal(responseData.tree.isPackage, true);

        logger?.info('✅ Package tree fetched successfully');
      });
    });

    it('should fetch package tree with subpackages', async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;
        const params = readCaseParams(
          context.params,
          SystemParams,
          'system_high_handlers',
        );
        if (!params?.test_package) {
          throw new Error(
            'test_package parameter is required in test configuration',
          );
        }
        const testPackage = params.test_package;

        logger?.info('🔍 Testing GetPackageTree with subpackages');
        logger?.info(`📋 Package: ${testPackage}`);

        const result = await tester.invokeToolOrHandler(
          'GetPackageTree',
          {
            package_name: testPackage,
            include_subpackages: true,
            max_depth: 2,
            include_descriptions: true,
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetPackageTree(handlerContext, {
              package_name: testPackage,
              include_subpackages: true,
              max_depth: 2,
              include_descriptions: true,
            });
          },
        );

        assert.equal(result.isError, false);
        assert.ok(result.content !== undefined);
        assert.ok(result.content.length > 0);

        // Parse response
        const textContent = result.content.find(
          (c: any) => c.type === 'text',
        ) as any;
        assert.ok(textContent !== undefined);

        const responseData = JSON.parse(textContent.text);
        assert.equal(responseData.package_name, testPackage.toUpperCase());
        assert.ok(responseData.tree !== undefined);
        assert.equal(responseData.tree.name, testPackage.toUpperCase());
        // Same node shape as the test above.
        assert.equal(responseData.tree.type, 'DEVC/K');
        assert.equal(responseData.tree.kind, 'package');
        assert.equal(responseData.tree.isPackage, true);
        assert.equal(responseData.metadata.include_subpackages, true);
        assert.equal(responseData.metadata.max_depth, 2);

        logger?.info('✅ Package tree with subpackages fetched successfully');
      });
    });

    it('should fetch package tree with limited depth', async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;
        const params = readCaseParams(
          context.params,
          SystemParams,
          'system_high_handlers',
        );
        if (!params?.test_package) {
          throw new Error(
            'test_package parameter is required in test configuration',
          );
        }
        const testPackage = params.test_package;

        logger?.info('🔍 Testing GetPackageTree with limited depth');
        logger?.info(`📋 Package: ${testPackage}, Max depth: 1`);

        const result = await tester.invokeToolOrHandler(
          'GetPackageTree',
          {
            package_name: testPackage,
            include_subpackages: true,
            max_depth: 1,
            include_descriptions: false,
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetPackageTree(handlerContext, {
              package_name: testPackage,
              include_subpackages: true,
              max_depth: 1,
              include_descriptions: false,
            });
          },
        );

        assert.equal(result.isError, false);
        assert.ok(result.content !== undefined);

        // Parse response
        const textContent = result.content.find(
          (c: any) => c.type === 'text',
        ) as any;
        assert.ok(textContent !== undefined);

        const responseData = JSON.parse(textContent.text);
        assert.equal(responseData.metadata.max_depth, 1);
        assert.equal(responseData.metadata.include_descriptions, false);

        logger?.info('✅ Package tree with limited depth fetched');
      });
    });

    it('should handle missing package_name error', async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;

        logger?.info('🔍 Testing error handling: missing package_name');

        const result = await tester.invokeToolOrHandler(
          'GetPackageTree',
          {
            package_name: '',
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetPackageTree(handlerContext, {
              package_name: '',
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
        assert.ok(textContent?.text.includes('package_name is required'));

        logger?.info('✅ Error handling validated: missing package_name');
      });
    });

    it('should handle invalid package name error', async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection } = context;

        logger?.info('🔍 Testing error handling: invalid package name');

        const result = await tester.invokeToolOrHandler(
          'GetPackageTree',
          {
            package_name: 'INVALID_PACKAGE_XYZ_123',
          },
          async () => {
            const handlerContext = createHandlerContext({
              connection,
              logger,
            });
            return handleGetPackageTree(handlerContext, {
              package_name: 'INVALID_PACKAGE_XYZ_123',
            });
          },
        );

        // Should return error for non-existent package (#38)
        assert.equal(result.isError, true);
        assert.ok(result.content !== undefined);
        logger?.info('✅ Error returned for invalid package (expected)');
      });
    });
  });
});
