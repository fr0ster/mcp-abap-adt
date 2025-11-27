/**
 * Integration tests for Package Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidatePackageLow → CreatePackageLow → LockPackageLow →
 * UnlockPackageLow → DeletePackageLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/package
 */

import { handleValidatePackage } from '../../../handlers/package/low/handleValidatePackage';
import { handleCreatePackage } from '../../../handlers/package/low/handleCreatePackage';
import { handleLockPackage } from '../../../handlers/package/low/handleLockPackage';
import { handleUnlockPackage } from '../../../handlers/package/low/handleUnlockPackage';
import { handleDeletePackage } from '../../../handlers/package/low/handleDeletePackage';

import {
  parseHandlerResponse,
  extractLockHandle,
  delay,
  logTestStep
} from '../helpers/testHelpers';
import {
  getTestSession,
  updateSessionFromResponse,
  extractLockSession,
  SessionInfo
} from '../helpers/sessionHelpers';
import {
  getEnabledTestCase,
  getTimeout,
  getOperationDelay,
  resolvePackageName,
  resolveTransportRequest,
  loadTestEnv,
  loadTestConfig
} from '../helpers/configHelpers';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection } from '../../../lib/utils';

// Load environment variables
loadTestEnv();

describe('Package Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;
  let defaultPackageExists = false;

  beforeAll(async () => {
    try {
      session = await getTestSession();
      hasConfig = true;

      // Pre-check: Verify default_package exists (required for package tests)
      const config = loadTestConfig();
      const defaultPackage = config.environment?.default_package;
      if (defaultPackage) {
        try {
          const connection = getManagedConnection();
          // Ensure connection is established (connect() is idempotent)
          await connection.connect();
          const client = new CrudClient(connection);
          const defaultPackageCheck = await client.checkPackage({
            packageName: defaultPackage.trim(),
            superPackage: undefined
          });
          if (defaultPackageCheck?.status === 200) {
            defaultPackageExists = true;
            if (process.env.DEBUG_TESTS === 'true') {
              console.log(`[PRE_CHECK] ✓ Default package ${defaultPackage} exists and is accessible`);
            }
          } else {
            console.error(`❌ Default package ${defaultPackage} check returned status ${defaultPackageCheck?.status}. All package tests will fail.`);
          }
        } catch (defaultPackageError: any) {
          const status = defaultPackageError.response?.status;
          if (status === 404) {
            console.error(`❌ Default package ${defaultPackage} does not exist! Please create it or update environment.default_package in test-config.yaml`);
          } else {
            console.warn(`⚠️  Cannot verify default package ${defaultPackage} (HTTP ${status}): ${defaultPackageError.message}`);
          }
        }
      } else {
        console.error(`❌ environment.default_package is not configured in test-config.yaml. Package tests require a default package.`);
      }
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testPackageName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_package_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      // package_name = parent package (super_package), test_package = package to create
      testPackageName = testCase.params.test_package;
    });

    it('should execute full workflow: Validate → Create → Lock → Unlock', async () => {
      if (!hasConfig || !session || !testCase || !testPackageName) {
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      if (!defaultPackageExists) {
        console.log('⏭️  Skipping test: Default package does not exist or is not accessible');
        return;
      }

      // package_name = parent package (super_package), test_package = package to create
      // If package_name is not specified, use default_package from environment
      const packageName = testPackageName; // Package to create (from test_package)
      const superPackage = resolvePackageName(testCase); // Parent package (from package_name or default_package)
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test package for low-level handler`;

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        logTestStep('validate');
        if (!session) {
          throw new Error('Session is null');
        }
        const validateResponse = await handleValidatePackage({
          package_name: packageName,
          super_package: superPackage,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Package ${packageName} already exists, skipping test`);
            return;
          }
          console.error(`Validation failed: ${errorMsg}`);
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);

        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          const messageLower = message.toLowerCase();
          if (validateData.validation_result?.exists ||
              messageLower.includes('already exists') ||
              messageLower.includes('does already exist')) {
            console.log(`⏭️  Package ${packageName} already exists, skipping test`);
            return;
          }
          console.warn(`⚠️  Validation failed for ${packageName}: ${message}. Will attempt create and handle if object exists...`);
        }

        session = updateSessionFromResponse(session, validateData);
        await delay(getOperationDelay('validate', testCase));

        // Step 2: Create
        logTestStep('create');
        if (!session) {
          throw new Error('Session is null');
        }
        // Build create args - only include optional params if explicitly provided
        const createArgs: any = {
          package_name: packageName,
          super_package: superPackage,
          description,
          package_type: testCase.params.package_type || 'development', // Must be 'development' or 'structure', not 'DEVC'
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        };
        // Only add optional params if explicitly provided in config
        if (testCase.params.software_component) {
          createArgs.software_component = testCase.params.software_component;
        }
        if (testCase.params.transport_layer) {
          createArgs.transport_layer = testCase.params.transport_layer;
        }

        const createResponse = await handleCreatePackage(createArgs);

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  Package ${packageName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.package_name).toBe(packageName);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        logTestStep('lock');
        if (!session) {
          throw new Error('Session is null');
        }
        const lockResponse = await handleLockPackage({
          package_name: packageName,
          super_package: superPackage || '',
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          const errorMsg = lockResponse.content[0]?.text || 'Unknown error';
          console.error(`Lock failed: ${errorMsg}`);
          throw new Error(`Lock failed: ${errorMsg}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        // IMPORTANT: Update session with lock session to use correct session_id and session_state
        session = {
          session_id: lockSession.session_id!,
          session_state: lockSession.session_state
        };

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Unlock
        logTestStep('unlock');
        const unlockResponse = await handleUnlockPackage({
          package_name: packageName,
          super_package: superPackage, // Required for package unlock
          lock_handle: lockHandle,
          session_id: lockSession.session_id!,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          const errorMsg = unlockResponse.content[0]?.text || 'Unknown error';
          console.error(`Unlock failed: ${errorMsg}`);
          throw new Error(`Unlock failed: ${errorMsg}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

      } catch (error: any) {
        // Extract step from error message
        const errorMessage = error.message || String(error);
        let failedStep = 'UNKNOWN';
        if (errorMessage.includes('Validation failed')) failedStep = 'VALIDATE';
        else if (errorMessage.includes('Create failed')) failedStep = 'CREATE';
        else if (errorMessage.includes('Lock failed')) failedStep = 'LOCK';
        else if (errorMessage.includes('Update failed')) failedStep = 'UPDATE';
        else if (errorMessage.includes('Unlock failed')) failedStep = 'UNLOCK';
        else if (errorMessage.includes('Activate failed')) failedStep = 'ACTIVATE';

        // Find where error was actually thrown (not where it was caught)
        const stackLines = error.stack?.split('\n') || [];
        const errorOrigin = stackLines.find((line: string) =>
          (line.includes('PackageBuilder') || line.includes('CrudClient.createPackage') ||
           line.includes('handleCreatePackage') || line.includes('createPackage'))
          && !line.includes('test.ts') && !line.includes('catch')
        ) || stackLines[0] || 'unknown';

        console.error(`❌ Test failed at ${failedStep}: ${errorMessage}`);
        if (errorOrigin !== 'unknown') {
          console.error(`   Error origin: ${errorOrigin.trim()}`);
        }
        throw error;
      } finally {
        // Cleanup
        if (session && packageName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockPackage({
                  package_name: packageName,
                  super_package: superPackage, // Required for package unlock
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id!,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                // Silent cleanup failure
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeletePackage({
              package_name: packageName,
              transport_request: transportRequest
            });

            if (deleteResponse.isError) {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              console.warn(`⚠️  Failed to delete package ${packageName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            console.warn(`⚠️  Failed to cleanup test package ${packageName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
