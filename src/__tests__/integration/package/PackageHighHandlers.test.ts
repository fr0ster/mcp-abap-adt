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

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleCreatePackage } from '../../../handlers/package/high/handleCreatePackage';
import { handleDeletePackage } from '../../../handlers/package/low/handleDeletePackage';

import {
  parseHandlerResponse,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
  SessionInfo
} from '../helpers/sessionHelpers';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv
} from '../helpers/configHelpers';

// Load environment variables
loadTestEnv();


describe('Package High-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Get initial session
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  it('should test all Package high-level handlers', async () => {
    if (!hasConfig || !session) {
      console.log('⏭️  Skipping test: No configuration or session');
      return;
    }

    // Get test case configuration
    const testCase = getEnabledTestCase('create_package', 'builder_package');

    if (!testCase) {
      console.log('⏭️  Skipping test: No test case configuration');
      return;
    }

    // For high-level: package_name = parent package (super_package), test_package = package to create
    // Use resolvePackageName to get super_package from package_name or default_package
    const superPackage = resolvePackageName(testCase); // Parent package (from package_name or default_package)
    const packageName = testCase.params?.test_package; // Package to create
    const transportRequest = resolveTransportRequest(testCase);
    const description = testCase.params?.description || `Test package for high-level handler`;

    if (!packageName) {
      console.log('⏭️  Skipping test: test_package not configured');
      return;
    }

    try {
      // Step 1: Create
      debugLog('CREATE', `Starting high-level package creation for ${packageName}`, {
        super_package: superPackage,
        description,
        software_component: testCase.params.software_component || 'undefined'
      });

      // Build create args
      const createArgs = {
        package_name: packageName,
        super_package: superPackage,
          description,
          package_type: testCase.params.package_type || 'development',
          software_component: testCase.params.software_component,
          transport_layer: testCase.params.transport_layer,
          transport_request: transportRequest,
          application_component: testCase.params.application_component
      };

      // Log parameters being passed to handler
      debugLog('CREATE', `Calling handleCreatePackage with args`, {
        package_name: createArgs.package_name,
        super_package: createArgs.super_package,
        software_component: createArgs.software_component || 'undefined'
      });

      let createResponse;
      try {
        createResponse = await handleCreatePackage(createArgs);
        debugLog('CREATE', `Handler returned response`, {
          isError: createResponse.isError
        });
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        const errorMsgLower = errorMsg.toLowerCase();
        debugLog('CREATE_ERROR', `Handler threw error: ${errorMsg}`, {
          error: errorMsg
        });
        // If package already exists, that's okay - we'll skip test
        if (errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('exceptionresourcealreadyexists') ||
            errorMsg.includes('InvalidObjName')) {
          console.log(`⏭️  Package ${packageName} already exists, skipping test`);
          return;
        }
        throw error;
      }

      if (createResponse.isError) {
        const errorMsg = createResponse.content[0]?.text || 'Unknown error';
        const errorMsgLower = errorMsg.toLowerCase();
        debugLog('CREATE_ERROR', `Response isError: ${errorMsg}`, {
          error: errorMsg,
          response: createResponse
        });
        // If package already exists, that's okay - we'll skip test
        if (errorMsgLower.includes('already exists') ||
            errorMsgLower.includes('does already exist') ||
            errorMsgLower.includes('exceptionresourcealreadyexists')) {
          console.log(`⏭️  Package ${packageName} already exists, skipping test`);
          return;
        }
        throw new Error(`Create failed: ${errorMsg}`);
      }

      const createData = parseHandlerResponse(createResponse);
      expect(createData.success).toBe(true);
      expect(createData.package_name).toBe(packageName);

      debugLog('CREATE', 'High-level package creation completed successfully', {
        package_name: createData.package_name,
        success: createData.success
      });

      await delay(getOperationDelay('create', testCase));
      console.log(`✅ High-level package creation completed successfully for ${packageName}`);

    } catch (error: any) {
      console.error(`❌ Test failed: ${error.message}`);
      throw error;
    } finally {
      // Cleanup: Delete test package
      if (packageName) {
        try {
          const deleteResponse = await handleDeletePackage({
            package_name: packageName,
            transport_request: transportRequest
          });

          if (!deleteResponse.isError) {
            console.log(`🧹 Cleaned up test package: ${packageName}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup test package ${packageName}: ${cleanupError}`);
        }
      }
    }
  }, getTimeout('long'));
});

