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
import {
  type AbapConnection,
  createAbapConnection,
} from '@mcp-abap-adt/connection';
import { handleDeleteClass } from '../../../../handlers/class/low/handleDeleteClass';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getSapConfigFromEnv,
  getSessionConfig,
  getTimeout,
  isCloudConnection,
  loadTestEnv,
  preCheckTestParameters,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createDiagnosticsTracker } from '../../helpers/persistenceHelpers';
import { DEBUG_TESTS, debugLog, delay } from '../../helpers/testHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

const testLogger = createTestLogger('class-crud-direct');

describe('Class CrudClient Direct (Reference Implementation)', () => {
  let hasConfig = false;
  let isCloud = false;

  beforeAll(async () => {
    // Load environment variables before creating connection
    await loadTestEnv();
    hasConfig = true;
  });

  it(
    'should create class using CrudClient directly (reference implementation)',
    async () => {
      if (!hasConfig) {
        testLogger?.info('⏭️  Skipping test: No SAP configuration');
        return;
      }

      const testCase = getEnabledTestCase('create_class_direct', 'crud_direct');
      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: Test case not enabled');
        return;
      }

      const logLine = (msg: string) => process.stdout.write(`${msg}\n`);

      // Create a separate connection for this test (not using getManagedConnection)
      let connection: AbapConnection | null = null;
      let client: CrudClient | null = null;
      let diagnosticsTracker: ReturnType<
        typeof createDiagnosticsTracker
      > | null = null;

      try {
        // Get configuration from environment variables
        const config = getSapConfigFromEnv();

        // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
        const connectionLogger = {
          debug:
            process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
          info:
            process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
          warn:
            process.env.DEBUG_CONNECTORS === 'true' ? console.warn : () => {},
          error:
            process.env.DEBUG_CONNECTORS === 'true' ? console.error : () => {},
          csrfToken:
            process.env.DEBUG_CONNECTORS === 'true' ? console.log : () => {},
        };

        // Create connection directly (same as in adt-clients tests)
        connection = createAbapConnection(config, connectionLogger);

        // Check refresh token availability before connecting
        const connectionWithRefresh = connection as any;
        if (
          connectionWithRefresh.getConfig &&
          connectionWithRefresh.canRefreshToken
        ) {
          const connConfig = connectionWithRefresh.getConfig();
          const canRefresh = connectionWithRefresh.canRefreshToken();
          if (process.env.DEBUG_TESTS === 'true') {
            testLogger?.debug(
              `[DEBUG] Test connection - Connection refresh token check:`,
              {
                canRefresh,
                hasRefreshToken: !!connConfig?.refreshToken,
                hasUaaUrl: !!connConfig?.uaaUrl,
                hasUaaClientId: !!connConfig?.uaaClientId,
                hasUaaClientSecret: !!connConfig?.uaaClientSecret,
              },
            );
          }
        }

        // connect() is not part of IAbapConnection interface, use type assertion
        const connectionAny = connection as any;
        if (connectionAny.connect) {
          await connectionAny.connect();
        }
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
              cookie_store: sessionState.cookieStore || {},
            },
          };
          diagnosticsTracker = createDiagnosticsTracker(
            'class_crud_direct',
            testCase,
            pseudoSession as any,
            {
              handler: 'create_class_direct',
              object_name: 'unknown',
            },
          );
        }

        debugLog('CONNECTION', `Created separate connection for test`, {
          url: config.url,
          authType: config.authType,
          hasClient: !!config.client,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        testLogger?.warn(
          '⚠️ Skipping test: Failed to create connection',
          errorMessage,
        );
        return;
      }

      const className = (testCase.params.class_name as string)
        ?.trim()
        .toUpperCase();
      // Resolve package name exactly as in adt-clients tests
      // In adt-clients: resolvePackageName(testCase.params.package_name)
      // But our helper takes testCase, so we pass testCase
      const packageName = resolvePackageName(testCase);
      if (!packageName) {
        testLogger?.info('⏭️  Skipping test: package_name not configured');
        if (connection) {
          // reset() is not part of IAbapConnection interface, use type assertion
          const connectionAny = connection as any;
          if (connectionAny.reset) {
            connectionAny.reset();
          }
        }
        return;
      }
      // Resolve transport request exactly as in adt-clients tests
      // In adt-clients: resolveTransportRequest(testCase.params.transport_request)
      // But our helper takes testCase, so we pass testCase
      const transportRequest = resolveTransportRequest(testCase);
      const description = (
        testCase.params.description || `Test class ${className}`
      ).trim();
      logLine(`▶️ CrudClient direct test starting for ${className}`);

      // Log parameters read from test case (only if DEBUG_TESTS is enabled)
      if (process.env.DEBUG_TESTS === 'true') {
        testLogger?.debug(`[DEBUG] Test case parameters read:`, {
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
          create_protected: testCase.params.create_protected,
        });
      }

      // Pre-check: Verify test parameters
      if (!client) {
        testLogger?.info('⏭️  Skipping test: Client not initialized');
        if (connection) {
          // reset() is not part of IAbapConnection interface, use type assertion
          const connectionAny = connection as any;
          if (connectionAny.reset) {
            connectionAny.reset();
          }
        }
        return;
      }

      const preCheckResult = await preCheckTestParameters(
        client,
        packageName,
        transportRequest,
        'CrudClient direct test',
      );
      if (!preCheckResult.success) {
        testLogger?.info(`⏭️  Skipping test: ${preCheckResult.reason}`);
        if (connection) {
          // reset() is not part of IAbapConnection interface, use type assertion
          const connectionAny = connection as any;
          if (connectionAny.reset) {
            connectionAny.reset();
          }
        }
        return;
      }

      debugLog(
        'TEST_START',
        `Starting CrudClient direct test for class: ${className}`,
        {
          className,
          packageName,
          description,
          transportRequest: transportRequest || '(not set)',
        },
      );

      // Track creation state for cleanup
      let classCreated = false;

      try {
        // Step 1: Validate (exactly as in adt-clients)
        debugLog('VALIDATE', `Starting validation for ${className}`, {
          className,
          packageName,
          description,
        });

        const validateParams = {
          className,
          packageName,
          description,
        };
        if (process.env.DEBUG_TESTS === 'true') {
          console.log(
            `[DEBUG] CrudClient.validateClass - Parameters:`,
            JSON.stringify(validateParams, null, 2),
          );
        }

        if (!client) {
          throw new Error('Client not initialized');
        }
        const validateResponse = await client.validateClass(validateParams);

        debugLog('VALIDATE_RESPONSE', `Validation completed`, {
          status: validateResponse?.status,
          statusText: validateResponse?.statusText,
        });

        // Check validation status exactly as in adt-clients
        if (validateResponse?.status !== 200) {
          const errorData =
            typeof validateResponse?.data === 'string'
              ? validateResponse.data
              : JSON.stringify(validateResponse?.data);
          testLogger?.error(
            `Validation failed (HTTP ${validateResponse?.status}): ${errorData}`,
          );
        }
        expect(validateResponse?.status).toBe(200);

        // Step 2: Create (exactly as in adt-clients)
        debugLog('CREATE', `Starting creation for ${className}`, {
          className,
          packageName,
          description,
          transportRequest: transportRequest || undefined,
        });

        // Check connection refresh token before create
        if (connection) {
          const connectionWithRefresh = connection as any;
          if (
            connectionWithRefresh.getConfig &&
            connectionWithRefresh.canRefreshToken
          ) {
            const connConfig = connectionWithRefresh.getConfig();
            const canRefresh = connectionWithRefresh.canRefreshToken();
            if (process.env.DEBUG_TESTS === 'true') {
              testLogger?.debug(
                `[DEBUG] Before createClass - Connection refresh check:`,
                {
                  canRefresh,
                  hasRefreshToken: !!connConfig?.refreshToken,
                  hasUaaUrl: !!connConfig?.uaaUrl,
                  hasUaaClientId: !!connConfig?.uaaClientId,
                  hasUaaClientSecret: !!connConfig?.uaaClientSecret,
                },
              );
            }
          }
        }

        const createParams = {
          className,
          description,
          packageName,
          transportRequest: transportRequest || undefined,
          superclass: testCase.params.superclass
            ? String(testCase.params.superclass).trim()
            : undefined,
          final: testCase.params.final as boolean | undefined,
          abstract: testCase.params.abstract as boolean | undefined,
          createProtected: testCase.params.create_protected as
            | boolean
            | undefined,
        };
        if (process.env.DEBUG_TESTS === 'true') {
          testLogger?.debug(
            `[DEBUG] CrudClient.createClass - Parameters:`,
            JSON.stringify(createParams, null, 2),
          );
          testLogger?.debug(
            `[DEBUG] CrudClient.createClass - Test case params:`,
            {
              superclass: testCase.params.superclass,
              final: testCase.params.final,
              abstract: testCase.params.abstract,
              create_protected: testCase.params.create_protected,
              transport_request: testCase.params.transport_request,
            },
          );
        }

        try {
          if (!client) {
            throw new Error('Client not initialized');
          }
          await client.createClass(createParams);
        } catch (createError: any) {
          // Log error details for debugging (only if DEBUG_TESTS is enabled)
          if (process.env.DEBUG_TESTS === 'true') {
            testLogger?.error(`[DEBUG] createClass error:`, {
              message: createError.message,
              status: createError.response?.status,
              statusText: createError.response?.statusText,
              data: createError.response?.data,
            });
          }
          throw createError;
        }

        // Add delay after create exactly as in adt-clients
        const createDelay = getOperationDelay('create', testCase);
        await new Promise((resolve) => setTimeout(resolve, createDelay));

        if (!client) {
          throw new Error('Client not initialized');
        }
        const createResult = client.getCreateResult();
        debugLog('CREATE_RESPONSE', `Creation completed`, {
          status: createResult?.status,
          statusText: createResult?.statusText,
        });

        expect(createResult).toBeDefined();
        // Accept both 201 (Created) and 200 (OK - object already exists)
        expect([200, 201]).toContain(createResult?.status);

        // Mark class as created successfully
        classCreated = true;

        // Allow backend to persist before check
        await delay(getOperationDelay('create_verify', testCase) || 500);

        // Step 3: Check (exactly as in adt-clients)
        debugLog('CHECK', `Starting check for ${className}`);
        const checkParams = {
          className,
        };
        if (process.env.DEBUG_TESTS === 'true') {
          testLogger?.debug(
            `[DEBUG] CrudClient.checkClass - Parameters:`,
            JSON.stringify(checkParams, null, 2),
          );
        }
        if (!client) {
          throw new Error('Client not initialized');
        }
        const checkResponse = await client.checkClass(checkParams);
        debugLog('CHECK_RESPONSE', `Check completed`, {
          status: checkResponse?.status,
          statusText: checkResponse?.statusText,
        });
        expect(checkResponse?.status).toBeDefined();

        logLine(`🏁 CrudClient direct test finished for ${className}`);
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        debugLog('TEST_ERROR', `Test failed: ${errorMessage}`, {
          error: errorMessage,
          stack: error.stack?.substring(0, 500),
        });
        testLogger?.error(`❌ CrudClient direct test failed: ${errorMessage}`);
        throw error;
      } finally {
        // Cleanup: Reset connection created for this test
        if (connection) {
          try {
            // reset() is not part of IAbapConnection interface, use type assertion
            const connectionAny = connection as any;
            if (connectionAny.reset) {
              connectionAny.reset();
            }
            debugLog('CLEANUP', `Reset test connection`);
          } catch (resetError: any) {
            debugLog(
              'CLEANUP_ERROR',
              `Failed to reset connection: ${resetError.message || resetError}`,
            );
          }
        }

        if (className) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            if (shouldCleanup && classCreated) {
              const deleteResponse = await handleDeleteClass(
                { connection, logger: testLogger },
                {
                  class_name: className,
                  transport_request: transportRequest,
                },
              );

              if (!deleteResponse.isError && DEBUG_TESTS) {
                logLine(`🧹 Cleaned up test class: ${className}`);
              } else if (deleteResponse.isError) {
                const errorMsg =
                  deleteResponse.content[0]?.text || 'Unknown error';
                logLine(`⚠️  Failed to delete class ${className}: ${errorMsg}`);
              }
            } else if (shouldCleanup) {
              debugLog(
                'CLEANUP',
                `Skipping deletion because class was not created during test`,
                {
                  class_name: className,
                  class_created: classCreated,
                },
              );
            } else {
              testLogger?.info(
                `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${className}`,
              );
            }
          } catch (cleanupError: any) {
            debugLog(
              'CLEANUP_ERROR',
              `Exception during cleanup: ${cleanupError}`,
              {
                error:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : String(cleanupError),
              },
            );
            testLogger?.warn(
              `⚠️  Failed to cleanup test class ${className}: ${cleanupError.message}`,
            );
          }
        }

        // Cleanup persisted diagnostics if configured
        diagnosticsTracker?.cleanup();
      }
    },
    getTimeout('long'),
  );
});
