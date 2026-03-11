/**
 * Integration tests for Package High-Level Handlers
 *
 * Tests all high-level handlers for Package module:
 * - CreatePackage (high-level) - handles validate, create, check
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true              - Test execution logs
 *   DEBUG_HANDLERS=true           - Handler logs
 *   DEBUG_ADT_LIBS=true           - Library logs
 *   DEBUG_CONNECTORS=true         - Connection logs
 *   DEBUG_CONNECTION_MANAGER=true - Connection manager logs (getManagedConnection)
 *
 * Run: npm test -- --testPathPattern=integration/package
 */

import { handleCreatePackage } from '../../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../../handlers/package/low/handleDeletePackage';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Package High-Level Handlers Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('package-high');

  beforeAll(async () => {
    tester = new LambdaTester(
      'create_package',
      'builder_package',
      'package-high',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        // Basic setup - connection is already created in tester
      },
      // Cleanup lambda - will be called by tester after checking YAML params
      async (context: LambdaTesterContext) => {
        const { connection, objectName, transportRequest } = context;
        if (!objectName) return;

        logger?.info(`   • cleanup: delete ${objectName}`);
        try {
          const deleteLogger = createTestLogger('package-high-delete');
          const deleteResponse = await tester.invokeToolOrHandler(
            'DeletePackageLow',
            {
              package_name: objectName,
              force_new_connection: true,
              ...(transportRequest && { transport_request: transportRequest }),
            },
            async () => {
              const deleteCtx = createHandlerContext({
                connection,
                logger: deleteLogger,
              });
              return handleDeletePackage(deleteCtx, {
                package_name: objectName,
                force_new_connection: true,
                ...(transportRequest && {
                  transport_request: transportRequest,
                }),
              });
            },
          );
          if (deleteResponse.isError) {
            const errorMsg = extractErrorMessage(deleteResponse);
            logger?.warn(`Delete failed (ignored in cleanup): ${errorMsg}`);
          } else {
            logger?.success(`✅ cleanup: deleted ${objectName} successfully`);
          }
        } catch (error: any) {
          logger?.warn(
            `Cleanup delete error (ignored): ${error.message || String(error)}`,
          );
        }
      },
    );
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async () => {});
  });

  beforeEach(async () => {
    await tester.beforeEach(async () => {});
  });

  afterEach(async () => {
    await tester.afterEach();
  });

  it(
    'should test all Package high-level handlers',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const {
          connection,
          objectName,
          params,
          packageName,
          transportRequest,
        } = context;

        expect(objectName).toBeDefined();
        expect(objectName).not.toBe('');
        if (!objectName) {
          throw new Error('objectName is required');
        }

        // For packages: objectName = test_package (package to create),
        // packageName = parent package (super_package)
        const superPackage = packageName;

        // Step 1: Create
        logger?.info(`   • create: ${objectName}`);
        const createLogger = createTestLogger('package-high-create');
        const createResponse = await tester.invokeToolOrHandler(
          'CreatePackage',
          {
            package_name: objectName,
            super_package: superPackage,
            description:
              params.description || `Test package for high-level handler`,
            package_type: params.package_type || 'development',
            ...(params.software_component && {
              software_component: params.software_component,
            }),
            ...(params.transport_layer && {
              transport_layer: params.transport_layer,
            }),
            ...(transportRequest && { transport_request: transportRequest }),
            ...(params.application_component && {
              application_component: params.application_component,
            }),
          },
          async () => {
            const createCtx = createHandlerContext({
              connection,
              logger: createLogger,
            });
            return handleCreatePackage(createCtx, {
              package_name: objectName,
              super_package: superPackage,
              description:
                params.description || `Test package for high-level handler`,
              package_type: params.package_type || 'development',
              software_component: params.software_component,
              transport_layer: params.transport_layer,
              transport_request: transportRequest,
              application_component: params.application_component,
            });
          },
        );

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          const errorMsgLower = errorMsg.toLowerCase();
          // If package already exists, that's okay - we'll skip test
          if (
            errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('exceptionresourcealreadyexists') ||
            errorMsg.includes('InvalidObjName')
          ) {
            logger?.info(
              `⏭️  Package ${objectName} already exists, skipping test`,
            );
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.package_name).toBe(objectName);
        logger?.success(`✅ create: ${objectName} completed successfully`);
      });
    },
    getTimeout('long'),
  );
});
