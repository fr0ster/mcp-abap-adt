/**
 * Integration tests for BehaviorDefinition Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateBehaviorDefinitionLow → CreateBehaviorDefinitionLow → LockBehaviorDefinitionLow →
 * UpdateBehaviorDefinitionLow → UnlockBehaviorDefinitionLow → ActivateBehaviorDefinitionLow → DeleteBehaviorDefinitionLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/behaviorDefinition
 *
 * @todo TODO: Apply same step-by-step logging pattern to all other integration tests
 * See: doc/development/TEST_LOGGING_ROADMAP.md
 * Pattern: console.log(`🔍 Step N: [Operation]...`) before, `✅ Step N: [Operation] successfully` after
 */

import { handleValidateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleValidateBehaviorDefinition';
import { handleCreateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleCreateBehaviorDefinition';
import { handleLockBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleLockBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleUpdateBehaviorDefinition';
import { handleUnlockBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleUnlockBehaviorDefinition';
import { handleActivateBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleActivateBehaviorDefinition';
import { handleDeleteBehaviorDefinition } from '../../../handlers/behavior_definition/low/handleDeleteBehaviorDefinition';

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

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('BehaviorDefinition Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      if (process.env.DEBUG_TESTS === 'true' || process.env.FULL_LOG_LEVEL === 'true') {
        console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      }
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testBdefName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_behavior_definition_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testBdefName = testCase.params.name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testBdefName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestBdefName: !!testBdefName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const bdefName = testBdefName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);

      // All parameters must come from configuration - no defaults
      if (!testCase.params.description) {
        throw new Error('description is required in test configuration');
      }
      const description = testCase.params.description;

      if (!testCase.params.root_entity) {
        throw new Error('root_entity is required in test configuration');
      }
      const rootEntity = testCase.params.root_entity;

      if (!testCase.params.implementation_type) {
        throw new Error('implementation_type is required in test configuration');
      }
      const implementationType = testCase.params.implementation_type.charAt(0).toUpperCase() + testCase.params.implementation_type.slice(1).toLowerCase();

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;
      let objectWasCreated = false; // Track if object was actually created
      const diagnosticsTracker = createDiagnosticsTracker('behavior_definition_low_full_workflow', testCase, session, {
        handler: 'create_behavior_definition_low',
        object_name: bdefName
      });

      try {
        // Step 1: Validate
        console.log(`🔍 Step 1: Validating ${bdefName}...`);
        const validateResponse = await handleValidateBehaviorDefinition({
          name: bdefName,
          root_entity: rootEntity,
          implementation_type: implementationType,
          description: description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          console.log(`⏭️  Validation error for ${bdefName}: ${errorMsg}, skipping test`);
          return;
        }

        const validateData = parseHandlerResponse(validateResponse);

        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          console.log(`⏭️  Validation failed for ${bdefName}: ${message}, skipping test`);
          return;
        }

        session = updateSessionFromResponse(session, validateData);
        console.log(`✅ Step 1: Validation successful for ${bdefName}`);

        // Step 2: Create
        console.log(`📦 Step 2: Creating ${bdefName}...`);
        const createArgs: any = {
          name: bdefName,
          description,
          package_name: packageName,
          root_entity: rootEntity,
          implementation_type: implementationType as 'Managed' | 'Unmanaged' | 'Abstract' | 'Projection',
          session_id: session.session_id,
          session_state: session.session_state
        };
        // Only include transport_request if it's provided (required for non-local packages)
        if (transportRequest) {
          createArgs.transport_request = transportRequest;
        }
        const createResponse = await handleCreateBehaviorDefinition(createArgs);

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          if (errorMsg.includes('already exists') || errorMsg.includes('does already exist')) {
            console.log(`⏭️  BehaviorDefinition ${bdefName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.name).toBe(bdefName);

        // Mark that object was successfully created
        objectWasCreated = true;
        console.log(`✅ Step 2: Created ${bdefName} successfully`);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        console.log(`🔒 Step 3: Locking ${bdefName}...`);
        const lockResponse = await handleLockBehaviorDefinition({
          name: bdefName,
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
        console.log(`✅ Step 3: Locked ${bdefName} successfully`);

        diagnosticsTracker.persistLock(lockSession, lockHandle, {
          object_type: 'BDEF',
          object_name: bdefName,
          transport_request: transportRequest
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        console.log(`📝 Step 4: Updating ${bdefName}...`);
        if (!testCase.params.source_code) {
          throw new Error('source_code is required in test configuration for update step');
        }
        const sourceCode = testCase.params.source_code;

        const updateResponse = await handleUpdateBehaviorDefinition({
          name: bdefName,
          source_code: sourceCode,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (updateResponse.isError) {
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        expect(updateData.session_id).toBe(lockSession.session_id);
        console.log(`✅ Step 4: Updated ${bdefName} successfully`);

        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        console.log(`🔓 Step 5: Unlocking ${bdefName}...`);
        const unlockResponse = await handleUnlockBehaviorDefinition({
          name: bdefName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        expect(unlockData.session_id).toBe(lockSession.session_id);
        console.log(`✅ Step 5: Unlocked ${bdefName} successfully`);

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        console.log(`⚡ Step 6: Activating ${bdefName}...`);
        const activateResponse = await handleActivateBehaviorDefinition({
          name: bdefName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);
        console.log(`✅ Step 6: Activated ${bdefName} successfully`);

        console.log(`✅ Full workflow completed successfully for ${bdefName}`);

      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: only if object was actually created in this test run
        // Skip cleanup if validation failed or object creation was skipped
        if (!objectWasCreated) {
          // Object was not created - no cleanup needed
          return;
        }

        // Only proceed with cleanup if object was successfully created
        if (session && bdefName) {
          try {
            const shouldCleanup = getCleanupAfter(testCase);

            // Always unlock (unlock is always performed)
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockBehaviorDefinition({
                  name: bdefName,
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

              const deleteResponse = await handleDeleteBehaviorDefinition({
                name: bdefName,
                transport_request: transportRequest
              });

              if (!deleteResponse.isError) {
                console.log(`🧹 Cleaned up test behavior definition: ${bdefName}`);
              } else {
                // Check if object doesn't exist (404) - that's okay, it may have been deleted already
                const errorMsg = deleteResponse.content[0]?.text || '';
                if (errorMsg.includes('not found') || errorMsg.includes('already be deleted')) {
                  // Object doesn't exist - that's fine, no need to log error
                } else {
                  // Other error - log but don't fail test
                  console.warn(`⚠️  Failed to delete behavior definition ${bdefName}: ${errorMsg}`);
                }
              }
            } else {
              console.log(`⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${bdefName}`);
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
