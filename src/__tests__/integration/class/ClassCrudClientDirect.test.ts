/**
 * Reference test - uses CrudClient directly (without handlers)
 *
 * This test uses CrudClient exactly the same way as in adt-clients tests.
 * Intended for comparing behavior with handler-based tests.
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/class/ClassCrudClientDirect
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { getManagedConnection } from '../../../lib/utils';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv,
  isCloudConnection,
  preCheckTestParameters
} from '../helpers/configHelpers';
import { debugLog, delay } from '../helpers/testHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Class CrudClient Direct (Reference Implementation)', () => {
  let connection: AbapConnection;
  let client: CrudClient;
  let hasConfig = false;
  let isCloud = false;

  beforeAll(async () => {
    try {
      // Create connection exactly as in adt-clients tests
      // Use getManagedConnection helper to get connection with proper config
      connection = getManagedConnection();

      // Check refresh token availability before connecting
      const connectionWithRefresh = connection as any;
      if (connectionWithRefresh.getConfig && connectionWithRefresh.canRefreshToken) {
        const config = connectionWithRefresh.getConfig();
        const canRefresh = connectionWithRefresh.canRefreshToken();
        console.log(`[DEBUG] beforeAll - Connection refresh token check:`, {
          canRefresh,
          hasRefreshToken: !!(config?.refreshToken),
          hasUaaUrl: !!(config?.uaaUrl),
          hasUaaClientId: !!(config?.uaaClientId),
          hasUaaClientSecret: !!(config?.uaaClientSecret)
        });
      }

      await connection.connect();
      client = new CrudClient(connection);
      hasConfig = true;
      isCloud = isCloudConnection();
    } catch (error) {
      console.warn('⚠️ Skipping tests: Failed to connect to SAP system', error);
      hasConfig = false;
    }
  });

  afterAll(async () => {
    if (connection) {
      connection.reset();
    }
  });

  it('should create class using CrudClient directly (reference implementation)', async () => {
    if (!hasConfig) {
      console.log('⏭️  Skipping test: No SAP configuration');
      return;
    }

    const testCase = getEnabledTestCase('create_class', 'builder_class');
    if (!testCase) {
      console.log('⏭️  Skipping test: Test case not enabled');
      return;
    }

    const className = (testCase.params.class_name as string)?.trim().toUpperCase();
    // Resolve package name exactly as in adt-clients tests
    // In adt-clients: resolvePackageName(testCase.params.package_name)
    // But our helper takes testCase, so we pass testCase
    const packageName = resolvePackageName(testCase);
    if (!packageName) {
      console.log('⏭️  Skipping test: package_name not configured');
      return;
    }
    // Resolve transport request exactly as in adt-clients tests
    // In adt-clients: resolveTransportRequest(testCase.params.transport_request)
    // But our helper takes testCase, so we pass testCase
    const transportRequest = resolveTransportRequest(testCase);
    const description = (testCase.params.description || `Test class ${className}`).trim();

    // Log parameters read from test case
    console.log(`[DEBUG] Test case parameters read:`, {
      class_name: testCase.params.class_name,
      className,
      package_name: testCase.params.package_name,
      packageName,
      description: testCase.params.description,
      resolvedDescription: description,
      transport_request: testCase.params.transport_request,
      resolvedTransportRequest: transportRequest,
      superclass: testCase.params.superclass,
      final: testCase.params.final,
      abstract: testCase.params.abstract,
      create_protected: testCase.params.create_protected
    });

    // Pre-check: Verify test parameters
    const preCheckResult = await preCheckTestParameters(
      client,
      packageName,
      transportRequest,
      'CrudClient direct test'
    );
    if (!preCheckResult.success) {
      console.log(`⏭️  Skipping test: ${preCheckResult.reason}`);
      return;
    }

    debugLog('TEST_START', `Starting CrudClient direct test for class: ${className}`, {
      className,
      packageName,
      description,
      transportRequest: transportRequest || '(not set)'
    });

    try {
      // Step 1: Validate (exactly as in adt-clients)
      debugLog('VALIDATE', `Starting validation for ${className}`, {
        className,
        packageName,
        description
      });

      const validateParams = {
        className,
        packageName,
        description
      };
      console.log(`[DEBUG] CrudClient.validateClass - Parameters:`, JSON.stringify(validateParams, null, 2));

      const validateResponse = await client.validateClass(validateParams);

      debugLog('VALIDATE_RESPONSE', `Validation completed`, {
        status: validateResponse?.status,
        statusText: validateResponse?.statusText
      });

      // Check validation status exactly as in adt-clients
      if (validateResponse?.status !== 200) {
        const errorData = typeof validateResponse?.data === 'string'
          ? validateResponse.data
          : JSON.stringify(validateResponse?.data);
        console.error(`Validation failed (HTTP ${validateResponse?.status}): ${errorData}`);
      }
      expect(validateResponse?.status).toBe(200);

      // Step 2: Create (exactly as in adt-clients)
      debugLog('CREATE', `Starting creation for ${className}`, {
        className,
        packageName,
        description,
        transportRequest: transportRequest || undefined
      });

      // Check connection refresh token before create
      const connectionWithRefresh = connection as any;
      if (connectionWithRefresh.getConfig && connectionWithRefresh.canRefreshToken) {
        const config = connectionWithRefresh.getConfig();
        const canRefresh = connectionWithRefresh.canRefreshToken();
        console.log(`[DEBUG] Before createClass - Connection refresh check:`, {
          canRefresh,
          hasRefreshToken: !!(config?.refreshToken),
          hasUaaUrl: !!(config?.uaaUrl),
          hasUaaClientId: !!(config?.uaaClientId),
          hasUaaClientSecret: !!(config?.uaaClientSecret)
        });
      }

      const createParams = {
        className,
        description,
        packageName,
        transportRequest: transportRequest || undefined,
        superclass: testCase.params.superclass ? String(testCase.params.superclass).trim() : undefined,
        final: testCase.params.final as boolean | undefined,
        abstract: testCase.params.abstract as boolean | undefined,
        createProtected: testCase.params.create_protected as boolean | undefined
      };
      console.log(`[DEBUG] CrudClient.createClass - Parameters:`, JSON.stringify(createParams, null, 2));
      console.log(`[DEBUG] CrudClient.createClass - Test case params:`, {
        superclass: testCase.params.superclass,
        final: testCase.params.final,
        abstract: testCase.params.abstract,
        create_protected: testCase.params.create_protected,
        transport_request: testCase.params.transport_request
      });

      try {
        await client.createClass(createParams);
      } catch (createError: any) {
        // Log error details for debugging
        console.error(`[DEBUG] createClass error:`, {
          message: createError.message,
          status: createError.response?.status,
          statusText: createError.response?.statusText,
          data: createError.response?.data
        });
        throw createError;
      }

      // Add delay after create exactly as in adt-clients
      const createDelay = getOperationDelay('create', testCase);
      await new Promise(resolve => setTimeout(resolve, createDelay));

      const createResult = client.getCreateResult();
      debugLog('CREATE_RESPONSE', `Creation completed`, {
        status: createResult?.status,
        statusText: createResult?.statusText
      });

      expect(createResult).toBeDefined();
      // Accept both 201 (Created) and 200 (OK - object already exists)
      expect([200, 201]).toContain(createResult?.status);

      // Step 3: Check (exactly as in adt-clients)
      debugLog('CHECK', `Starting check for ${className}`);
      const checkParams = {
        className
      };
      console.log(`[DEBUG] CrudClient.checkClass - Parameters:`, JSON.stringify(checkParams, null, 2));
      const checkResponse = await client.checkClass(checkParams);
      debugLog('CHECK_RESPONSE', `Check completed`, {
        status: checkResponse?.status,
        statusText: checkResponse?.statusText
      });
      expect(checkResponse?.status).toBeDefined();

      console.log(`✅ CrudClient direct test completed successfully for ${className}`);

    } catch (error: any) {
      const errorMessage = error.message || String(error);
      debugLog('TEST_ERROR', `Test failed: ${errorMessage}`, {
        error: errorMessage,
        stack: error.stack?.substring(0, 500)
      });
      console.error(`❌ CrudClient direct test failed: ${errorMessage}`);
      throw error;
    } finally {
      // Cleanup: Delete test class
      if (className) {
        try {
          debugLog('CLEANUP', `Starting cleanup: deleting test class ${className}`);
          await client.deleteClass({
            className
          });
          console.log(`🧹 Cleaned up test class: ${className}`);
        } catch (cleanupError: any) {
          console.warn(`⚠️  Failed to cleanup test class ${className}: ${cleanupError.message}`);
        }
      }
    }
  }, getTimeout('long'));
});

