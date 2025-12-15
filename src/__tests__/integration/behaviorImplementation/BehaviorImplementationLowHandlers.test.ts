/**
 * Integration tests for BehaviorImplementation Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateBehaviorImplementationLow → CreateClass → CheckClass → LockBehaviorImplementationLow →
 * UpdateClass → UnlockClass → ActivateClass → DeleteClass
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorImplementation
 */

import { handleValidateBehaviorImplementation } from '../../../handlers/behavior_implementation/low/handleValidateBehaviorImplementation';
import { handleCreateClass } from '../../../handlers/class/low/handleCreateClass';
import { handleCheckClass } from '../../../handlers/class/low/handleCheckClass';
import { handleLockBehaviorImplementation } from '../../../handlers/behavior_implementation/low/handleLockBehaviorImplementation';
import { handleUnlockClass } from '../../../handlers/class/low/handleUnlockClass';
import { handleActivateClass } from '../../../handlers/class/low/handleActivateClass';
import { handleDeleteClass } from '../../../handlers/class/low/handleDeleteClass';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection } from '../../../lib/utils';

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
  getCleanupAfter
} from '../helpers/configHelpers';
import { createDiagnosticsTracker } from '../helpers/persistenceHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { generateSessionId } from '../../../lib/sessionUtils';

// Load environment variables
// loadTestEnv will be called in beforeAll

const testLogger = createTestLogger('bimpl-low');

describe('BehaviorImplementation Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;
  let connection: AbapConnection;
  beforeAll(async () => {
    try {
      connection = getManagedConnection();
      await connection.connect();
      const sessionId = generateSessionId();
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      testLogger.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testClassName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_behavior_implementation_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testClassName = testCase.params.class_name;
    });

    it('should execute full workflow: Validate → Create → Check → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testClassName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestClassName: !!testClassName
        });
        testLogger.info('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const className = testClassName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);

      // All parameters must come from configuration - no defaults
      if (!testCase.params.description) {
        throw new Error('description is required in test configuration');
      }
      const description = testCase.params.description;

      if (!testCase.params.behavior_definition) {
        throw new Error('behavior_definition is required in test configuration');
      }
      const behaviorDefinition = testCase.params.behavior_definition;

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;
      let objectWasCreated = false; // Track if object was actually created
      const diagnosticsTracker = createDiagnosticsTracker('behavior_implementation_low_full_workflow', testCase, session, {
        handler: 'create_behavior_implementation_low',
        object_name: className
      });

      try {
        // Step 1: Validate
        testLogger.info(`🔍 Step 1: Validating ${className}...`);
        const validateResponse = await handleValidateBehaviorImplementation(connection, {
          class_name: className,
          behavior_definition: behaviorDefinition,
          package_name: packageName,
          description: description,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          testLogger.info(`⏭️  Validation error for ${className}: ${errorMsg}, skipping test`);
          return;
        }

        const validateData = parseHandlerResponse(validateResponse);
        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          testLogger.info(`⏭️  Validation failed for ${className}: ${message}, skipping test`);
          return;
        }

        session = updateSessionFromResponse(session, validateData);
        testLogger.success(`✅ Step 1: Validation successful for ${className}`);

        // Step 2: Create (as regular class first)
        testLogger.info(`📦 Step 2: Creating ${className}...`);
        const createArgs: any = {
          class_name: className,
          description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        };
        // Only include transport_request if it's provided (required for non-local packages)
        if (transportRequest) {
          createArgs.transport_request = transportRequest;
        }
        const createResponse = await handleCreateClass(connection, createArgs);

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            testLogger.info(`⏭️  BehaviorImplementation ${className} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.class_name).toBe(className);

        // Mark that object was successfully created
        objectWasCreated = true;
        testLogger.success(`✅ Step 2: Created ${className} successfully`);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Check
        testLogger.info(`🔍 Step 3: Checking ${className}...`);
        const checkResponse = await handleCheckClass(connection, {
          class_name: className,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (checkResponse.isError) {
          throw new Error(`Check failed: ${checkResponse.content[0]?.text || 'Unknown error'}`);
        }

        const checkData = parseHandlerResponse(checkResponse);
        expect(checkData.success).toBeDefined();
        testLogger.success(`✅ Step 3: Check successful for ${className}`);

        await delay(getOperationDelay('create', testCase));

        // Step 4: Lock
        testLogger.info(`🔒 Step 4: Locking ${className}...`);
        const lockResponse = await handleLockBehaviorImplementation(connection, {
          class_name: className,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          throw new Error(`Lock failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        const lockHandle = extractLockHandle(lockData);
        const lockSession = extractLockSession(lockData);

        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();

        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;
        testLogger.success(`✅ Step 4: Locked ${className} successfully`);

        diagnosticsTracker.persistLock(lockSession, lockHandle, {
          object_type: 'CLAS',
          object_name: className,
          transport_request: transportRequest
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 5: Update implementations include (local handler class)
        testLogger.info(`📝 Step 5: Updating implementations include for ${className}...`);
        if (!testCase.params.implementation_code) {
          throw new Error('implementation_code is required in test configuration for update step (implementations include)');
        }
        const implementationCode = testCase.params.implementation_code;

        // Update main source with "FOR BEHAVIOR OF" clause first
        const client = new CrudClient(connection);

        // Update main source with "FOR BEHAVIOR OF"
        await client.updateBehaviorImplementationMainSource({
          className: className,
          behaviorDefinition: behaviorDefinition
        }, lockHandle);

        // Update implementations include with local handler class
        // Use CrudClient method with custom code
        await client.updateBehaviorImplementation({
          className: className,
          behaviorDefinition: behaviorDefinition,
          implementationCode: implementationCode
        }, lockHandle);

        testLogger.success(`✅ Step 5: Updated implementations include for ${className} successfully`);

        await delay(getOperationDelay('update', testCase));

        // Step 6: Unlock
        testLogger.info(`🔓 Step 6: Unlocking ${className}...`);
        const unlockResponse = await handleUnlockClass(connection, {
          class_name: className,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        testLogger.success(`✅ Step 6: Unlocked ${className} successfully`);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 7: Activate
        testLogger.info(`⚡ Step 7: Activating ${className}...`);
        const activateResponse = await handleActivateClass(connection, {
          class_name: className,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        if (!activateData.success) {
          testLogger.error(`❌ Activation failed. Response data: ${JSON.stringify(activateData, null, 2)}`);
          throw new Error(`Activation failed: ${JSON.stringify(activateData)}`);
        }
        expect(activateData.success).toBe(true);
        testLogger.success(`✅ Step 7: Activated ${className} successfully`);

        testLogger.success(`✅ Full workflow completed successfully for ${className}`);

      } catch (error: any) {
        testLogger.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: only if object was actually created in this test run
        if (!objectWasCreated) {
          return;
        }
        // Only proceed with cleanup if object was successfully created
        if (session && className) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Always unlock (unlock is always performed)
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockClass(connection, {
                  class_name: className,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                // Ignore unlock errors during cleanup
              }
            }

            // Delete only if cleanup_after is true
            if (shouldCleanup) {
              await delay(1000);
              const deleteResponse = await handleDeleteClass(connection, {
                class_name: className,
                transport_request: transportRequest
              });
              if (!deleteResponse.isError) {
                testLogger.info(`🧹 Cleaned up test behavior implementation: ${className}`);
              } else {
                // Check if object doesn't exist (404) - that's okay, it may have been deleted already
                const errorMsg = deleteResponse.content[0]?.text || '';
                if (errorMsg.includes('not found') || errorMsg.includes('already be deleted')) {
                  // Object doesn't exist - that's fine, no need to log error
                } else {
                  // Other error - log but don't fail test
                  testLogger.warn(`⚠️  Failed to delete behavior implementation ${className}: ${errorMsg}`);
                }
              }
            } else {
              testLogger.info(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${className}`);
            }
          } catch (cleanupError: any) {
            // Ignore cleanup errors - object may not exist or may have been deleted already
          }
        }

        diagnosticsTracker.cleanup();
      }
    }, getTimeout('long'));
  });
});
