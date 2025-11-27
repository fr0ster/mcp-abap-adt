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
  debugLog
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
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestPackageName: !!testPackageName
        });
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

      // Log all parameters read from config
      console.log('📋 Test Parameters Read from Config:');
      console.log('  package_name (super_package):', superPackage, testCase.params.package_name ? '(from test case)' : '(from default_package)');
      console.log('  test_package (package to create):', packageName);
      console.log('  description:', description);
      console.log('  package_type:', testCase.params.package_type || 'development');
      console.log('  software_component:', testCase.params.software_component || '(not set)');
      console.log('  transport_layer:', testCase.params.transport_layer || '(not set)');
      console.log('  transport_request:', transportRequest || '(not set)');
      console.log('  application_component:', testCase.params.application_component || '(not set)');
      console.log('  session_id:', session.session_id);
      console.log('  session_state:', session.session_state ? 'present' : 'not present');

      debugLog('TEST_START', `Starting full workflow test for package: ${packageName}`, {
        packageName,
        superPackage,
        transportRequest,
        description,
        software_component: testCase.params.software_component,
        package_type: testCase.params.package_type
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${packageName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidatePackage({
          package_name: packageName,
          super_package: superPackage,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          debugLog('VALIDATE_ERROR', `Validation returned error: ${errorMsg}`, {
            error: errorMsg,
            response: validateResponse
          });
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Package ${packageName} already exists, skipping test`);
            return;
          }
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        const validateData = parseHandlerResponse(validateResponse);
        debugLog('VALIDATE_RESPONSE', `Validation response parsed`, {
          valid: validateData.validation_result?.valid,
          message: validateData.validation_result?.message,
          exists: validateData.validation_result?.exists
        });

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

        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Validation completed and session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${packageName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
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

        // Log parameters being passed to handler
        console.log('📤 Parameters Passed to handleCreatePackage:');
        console.log('  package_name:', createArgs.package_name);
        console.log('  super_package:', createArgs.super_package);
        console.log('  description:', createArgs.description);
        console.log('  package_type:', createArgs.package_type);
        console.log('  software_component:', createArgs.software_component || '(not set)');
        console.log('  transport_layer:', createArgs.transport_layer || '(not set)');
        console.log('  transport_request:', createArgs.transport_request || '(not set)');
        console.log('  session_id:', createArgs.session_id);
        console.log('  session_state:', createArgs.session_state ? 'present' : 'not present');

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

        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Creation completed and session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${packageName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockPackage({
          package_name: packageName,
          super_package: superPackage || '',
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          debugLog('LOCK_ERROR', `Lock returned error: ${lockResponse.content[0]?.text || 'Unknown error'}`, {
            response: lockResponse
          });
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Unlock
        debugLog('UNLOCK', `Starting unlock for ${packageName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          has_session_state: !!lockSession.session_state
        });
        const unlockResponse = await handleUnlockPackage({
          package_name: packageName,
          super_package: superPackage, // Required for package unlock
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          debugLog('UNLOCK_ERROR', `Unlock returned error: ${unlockResponse.content[0]?.text || 'Unknown error'}`, {
            response: unlockResponse
          });
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);

        const oldSessionId3 = session.session_id;
        session = updateSessionFromResponse(session, unlockData);
        debugLog('UNLOCK', 'Unlock completed and session updated', {
          old_session_id: oldSessionId3,
          new_session_id: session.session_id,
          session_changed: oldSessionId3 !== session.session_id
        });
        await delay(getOperationDelay('unlock', testCase));

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${packageName}`, {
          packageName,
          steps_completed: ['validate', 'create', 'lock', 'unlock']
        });
        console.log(`✅ Full workflow completed successfully for ${packageName}`);

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
        debugLog('CLEANUP', `Starting cleanup for ${packageName}`, {
          packageName,
          hasSession: !!session
        });
        if (session && packageName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockPackage({
                  package_name: packageName,
                  super_package: superPackage, // Required for package unlock
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle: ${unlockError.message}`);
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeletePackage({
              package_name: packageName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test package: ${packageName}`);
              console.log(`🧹 Cleaned up test package: ${packageName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete package ${packageName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete package ${packageName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test package ${packageName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test package ${packageName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
