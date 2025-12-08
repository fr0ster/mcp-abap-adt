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
import { AbapConnection, createAbapConnection } from '@mcp-abap-adt/connection';
import { getConfig } from '../../../index';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv,
  isCloudConnection,
  preCheckTestParameters,
  getCleanupAfter,
  getSessionConfig
} from '../helpers/configHelpers';
import { debugLog, delay } from '../helpers/testHelpers';
import { createDiagnosticsTracker } from '../helpers/persistenceHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Class CrudClient Direct (Reference Implementation)', () => {
  let hasConfig = false;
  let isCloud = false;

  beforeAll(async () => {
    try {
      // Load environment variables before creating connection
      await loadTestEnv();
      hasConfig = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Skipping tests: Failed to load test environment', errorMessage);
      hasConfig = false;
    }
  });

  it('should create class using CrudClient directly (reference implementation)', async () => {
    if (!hasConfig) {
      console.log('⏭️  Skipping test: No SAP configuration');
      return;
    }

    // Create a separate connection for this test (not using getManagedConnection)
    let connection: AbapConnection | null = null;
    let client: CrudClient | null = null;
    let diagnosticsTracker: ReturnType<typeof createDiagnosticsTracker> | null = null;

    try {
      // Get configuration from environment variables
      const config = getConfig();

      // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
      const connectionLogger = {
        debug: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        info: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        warn: process.env.DEBUG_CONNECTORS === 'true' ? console.warn : () => {},
        error: process.env.DEBUG_CONNECTORS === 'true' ? console.error : () => {},
        csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {}
      };

      // Create connection directly (same as in adt-clients tests)
      connection = createAbapConnection(config, connectionLogger);

      // Check refresh token availability before connecting
      const connectionWithRefresh = connection as any;
      if (connectionWithRefresh.getConfig && connectionWithRefresh.canRefreshToken) {
        const connConfig = connectionWithRefresh.getConfig();
        const canRefresh = connectionWithRefresh.canRefreshToken();
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`[DEBUG] Test connection - Connection refresh token check:`, {
            canRefresh,
            hasRefreshToken: !!(connConfig?.refreshToken),
            hasUaaUrl: !!(connConfig?.uaaUrl),
            hasUaaClientId: !!(connConfig?.uaaClientId),
            hasUaaClientSecret: !!(connConfig?.uaaClientSecret)
          });
        }
      }

      await connection.connect();
      client = new CrudClient(connection);
      isCloud = isCloudConnection(); // Uses getManagedConnection internally, but we have separate connection

      // Persist session snapshot for diagnostics
      const sessionState = (connection as any).getSessionState?.();
      if (sessionState) {
        const pseudoSession = {
          session_id: `crud_direct_${Date.now()}`,
          session_state: {
            cookies: sessionState.cookies || '',
            csrf_token: sessionState.csrfToken || '',
            cookie_store: sessionState.cookieStore || {}
          }
        };
        diagnosticsTracker = createDiagnosticsTracker('class_crud_direct', testCase, pseudoSession as any, {
          handler: 'create_class_direct',
          object_name: 'unknown'
        });
      }

      debugLog('CONNECTION', `Created separate connection for test`, {
        url: config.url,
        authType: config.authType,
        hasClient: !!config.client
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('⚠️ Skipping test: Failed to create connection', errorMessage);
      return;
    }

    const testCase = getEnabledTestCase('create_class_direct', 'crud_direct');
    if (!testCase) {
      console.log('⏭️  Skipping test: Test case not enabled');
      if (connection) {
        connection.reset();
      }
      return;
    }

    const className = (testCase.params.class_name as string)?.trim().toUpperCase();
    // Resolve package name exactly as in adt-clients tests
    // In adt-clients: resolvePackageName(testCase.params.package_name)
    // But our helper takes testCase, so we pass testCase
    const packageName = resolvePackageName(testCase);
    if (!packageName) {
      console.log('⏭️  Skipping test: package_name not configured');
      if (connection) {
        connection.reset();
      }
      return;
    }
    // Resolve transport request exactly as in adt-clients tests
    // In adt-clients: resolveTransportRequest(testCase.params.transport_request)
    // But our helper takes testCase, so we pass testCase
    const transportRequest = resolveTransportRequest(testCase);
    const description = (testCase.params.description || `Test class ${className}`).trim();

    // Log parameters read from test case (only if DEBUG_TESTS is enabled)
    if (process.env.DEBUG_TESTS === 'true') {
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
    }

    // Pre-check: Verify test parameters
    if (!client) {
      console.log('⏭️  Skipping test: Client not initialized');
      if (connection) {
        connection.reset();
      }
      return;
    }

    const preCheckResult = await preCheckTestParameters(
      client,
      packageName,
      transportRequest,
      'CrudClient direct test'
    );
    if (!preCheckResult.success) {
      console.log(`⏭️  Skipping test: ${preCheckResult.reason}`);
      if (connection) {
        connection.reset();
      }
      return;
    }

    debugLog('TEST_START', `Starting CrudClient direct test for class: ${className}`, {
      className,
      packageName,
      description,
      transportRequest: transportRequest || '(not set)'
    });

    // Track creation state for cleanup
    let classCreated = false;

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
      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[DEBUG] CrudClient.validateClass - Parameters:`, JSON.stringify(validateParams, null, 2));
      }

      if (!client) {
        throw new Error('Client not initialized');
      }
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
      if (connection) {
      const connectionWithRefresh = connection as any;
      if (connectionWithRefresh.getConfig && connectionWithRefresh.canRefreshToken) {
          const connConfig = connectionWithRefresh.getConfig();
        const canRefresh = connectionWithRefresh.canRefreshToken();
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(`[DEBUG] Before createClass - Connection refresh check:`, {
            canRefresh,
              hasRefreshToken: !!(connConfig?.refreshToken),
              hasUaaUrl: !!(connConfig?.uaaUrl),
              hasUaaClientId: !!(connConfig?.uaaClientId),
              hasUaaClientSecret: !!(connConfig?.uaaClientSecret)
          });
          }
        }
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
      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[DEBUG] CrudClient.createClass - Parameters:`, JSON.stringify(createParams, null, 2));
        console.log(`[DEBUG] CrudClient.createClass - Test case params:`, {
          superclass: testCase.params.superclass,
          final: testCase.params.final,
          abstract: testCase.params.abstract,
          create_protected: testCase.params.create_protected,
          transport_request: testCase.params.transport_request
        });
      }

      try {
        if (!client) {
          throw new Error('Client not initialized');
        }
        await client.createClass(createParams);
      } catch (createError: any) {
        // Log error details for debugging (only if DEBUG_TESTS is enabled)
        if (process.env.DEBUG_TESTS === 'true') {
          console.error(`[DEBUG] createClass error:`, {
            message: createError.message,
            status: createError.response?.status,
            statusText: createError.response?.statusText,
            data: createError.response?.data
          });
        }
        throw createError;
      }

      // Add delay after create exactly as in adt-clients
      const createDelay = getOperationDelay('create', testCase);
      await new Promise(resolve => setTimeout(resolve, createDelay));

      if (!client) {
        throw new Error('Client not initialized');
      }
      const createResult = client.getCreateResult();
      debugLog('CREATE_RESPONSE', `Creation completed`, {
        status: createResult?.status,
        statusText: createResult?.statusText
      });

      expect(createResult).toBeDefined();
      // Accept both 201 (Created) and 200 (OK - object already exists)
      expect([200, 201]).toContain(createResult?.status);

      // Mark class as created successfully
      classCreated = true;

      // Step 3: Check (exactly as in adt-clients)
      debugLog('CHECK', `Starting check for ${className}`);
      const checkParams = {
        className
      };
      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[DEBUG] CrudClient.checkClass - Parameters:`, JSON.stringify(checkParams, null, 2));
      }
      if (!client) {
        throw new Error('Client not initialized');
      }
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
      // Cleanup: Reset connection created for this test
      if (connection) {
        try {
          connection.reset();
          debugLog('CLEANUP', `Reset test connection`);
        } catch (resetError: any) {
          debugLog('CLEANUP_ERROR', `Failed to reset connection: ${resetError.message || resetError}`);
        }
      }

      if (className) {
        try {
          const shouldCleanup = getCleanupAfter(testCase);

          if (shouldCleanup && classCreated) {
            const deleteResponse = await handleDeleteClass({
              class_name: className,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              console.log(`🧹 Cleaned up test class: ${className}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete class ${className}: ${errorMsg}`);
            }
          } else if (shouldCleanup) {
            debugLog('CLEANUP', `Skipping deletion because class was not created during test`, {
              class_name: className,
              class_created: classCreated
            });
          } else {
            console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${className}`);
          }
        } catch (cleanupError: any) {
          debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          });
          console.warn(`⚠️  Failed to cleanup test class ${className}: ${cleanupError.message}`);
        }
      }

      // Cleanup persisted diagnostics if configured
      diagnosticsTracker?.cleanup();
    }
  }, getTimeout('long'));
});
