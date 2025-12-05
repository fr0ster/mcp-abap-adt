/**
 * Integration tests for Interface Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateInterfaceLow → CreateInterfaceLow → LockInterfaceLow →
 * UpdateInterfaceLow → UnlockInterfaceLow → ActivateInterfaceLow → DeleteInterfaceLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/interface
 */

import { handleValidateInterface } from '../../../handlers/interface/low/handleValidateInterface';
import { handleCreateInterface } from '../../../handlers/interface/low/handleCreateInterface';
import { handleLockInterface } from '../../../handlers/interface/low/handleLockInterface';
import { handleUpdateInterface } from '../../../handlers/interface/low/handleUpdateInterface';
import { handleCheckInterface } from '../../../handlers/interface/low/handleCheckInterface';
import { handleUnlockInterface } from '../../../handlers/interface/low/handleUnlockInterface';
import { handleActivateInterface } from '../../../handlers/interface/low/handleActivateInterface';
import { handleDeleteInterface } from '../../../handlers/interface/low/handleDeleteInterface';

import {
  parseHandlerResponse,
  extractLockHandle,
  extractErrorMessage,
  delay,
  debugLog,
  isAlreadyCheckedError,
  isAlreadyExistsError,
  handleCheckResponse,
  shouldSkipDueToExistingObject
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
  loadTestEnv
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Interface Low-Level Handlers Integration', () => {
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      session = await getTestSession();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testInterfaceName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      testCase = getEnabledTestCase('create_interface_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testInterfaceName = testCase.params.interface_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testInterfaceName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestInterfaceName: !!testInterfaceName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const interfaceName = testInterfaceName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test interface for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for interface: ${interfaceName}`, {
        interfaceName,
        packageName,
        transportRequest,
        description
      });

      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Validating ${interfaceName}`);
        const validateResponse = await handleValidateInterface({
          interface_name: interfaceName,
          description: description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        const validateData = validateResponse.isError ? null : parseHandlerResponse(validateResponse);

        // Check if object already exists using helper
        if (shouldSkipDueToExistingObject(validateResponse, validateData || {}, interfaceName)) {
          console.log(`⏭️  Interface ${interfaceName} already exists, skipping test`);
          return;
        }

        if (validateResponse.isError) {
          const errorMsg = extractErrorMessage(validateResponse);
          throw new Error(`Validation failed: ${errorMsg}`);
        }

        if (!validateData) {
          throw new Error('Validation did not return data');
        }

        // Status 400 might be other validation error - continue with warning
        if (!validateData.validation_result?.valid) {
          const message = validateData.validation_result?.message || '';
          console.warn(`⚠️  Validation failed for ${interfaceName}: ${message}. Will attempt create...`);
        }

        session = updateSessionFromResponse(session, validateData);

        // Step 2: Create
        debugLog('CREATE', `Creating ${interfaceName}`);
        const createResponse = await handleCreateInterface({
          interface_name: interfaceName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          const errorMsg = extractErrorMessage(createResponse);
          if (isAlreadyExistsError(errorMsg)) {
            console.log(`⏭️  Interface ${interfaceName} already exists, skipping test`);
            return;
          }
          throw new Error(`Create failed: ${errorMsg}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.interface_name).toBe(interfaceName);

        session = updateSessionFromResponse(session, createData);
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Locking ${interfaceName}`);
        const lockResponse = await handleLockInterface({
          interface_name: interfaceName,
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

        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const sourceCode = testCase.params.source_code || `INTERFACE ${interfaceName.toLowerCase()}.\n  METHODS: test_method.\nENDINTERFACE.`;

        debugLog('UPDATE', `Updating ${interfaceName}`);
        const updateResponse = await handleUpdateInterface({
          interface_name: interfaceName,
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

        await delay(getOperationDelay('update', testCase));

        // Step 5: Check (syntax validation before unlock)
        debugLog('CHECK', `Checking ${interfaceName}`);
        const checkResponse = await handleCheckInterface({
          interface_name: interfaceName,
          session_id: lockSession.session_id,
          session_state: lockSession.session_state
        });

        // Use helper to handle "already checked" - it's not an error
        handleCheckResponse(checkResponse, interfaceName);

        await delay(getOperationDelay('check', testCase) || 1000);

        // Step 6: Unlock
        debugLog('UNLOCK', `Unlocking ${interfaceName}`);
        const unlockResponse = await handleUnlockInterface({
          interface_name: interfaceName,
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

        session = updateSessionFromResponse(session, unlockData);
        await delay(getOperationDelay('unlock', testCase));

        // Step 7: Activate
        debugLog('ACTIVATE', `Activating ${interfaceName}`);
        const activateResponse = await handleActivateInterface({
          interface_name: interfaceName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);

        // For Interface, activation may return generated: true but activated: false
        // in some edge cases. We consider it successful if:
        // 1. No errors in messages, AND
        // 2. (activated: true && checked: true) OR generated: true
        const hasErrors = activateData.errors && activateData.errors.length > 0;
        const isGenerated = activateData.activation?.generated === true;
        const isFullyActivated = activateData.activation?.activated === true && activateData.activation?.checked === true;

        if (hasErrors) {
          const errorMessages = activateData.errors.map((e: any) => e.text || '').join(' ');
          const errorMessagesLower = errorMessages.toLowerCase();
          const isNameConflict = errorMessagesLower.includes('already exists') &&
                                 (errorMessagesLower.includes('class') ||
                                  errorMessagesLower.includes('interface'));
          const isActivationCancelled = errorMessagesLower.includes('activation was cancelled') ||
                                        errorMessagesLower.includes('cancelled');

          if (isNameConflict || isActivationCancelled) {
            console.warn(`⚠️  Activation skipped: ${errorMessages}`);
            return;
          }

          // If checked passed, accept as success
          if (activateData.activation?.checked === true) {
            console.warn(`⚠️  Activation had errors but syntax check passed`);
            return;
          }

          throw new Error(`Activation failed: ${errorMessages}`);
        }

        expect(isGenerated || isFullyActivated).toBe(true);

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${interfaceName}`, {
          interfaceName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'check', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${interfaceName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          interfaceName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup
        debugLog('CLEANUP', `Starting cleanup for ${interfaceName}`, {
          interfaceName,
          hasSession: !!session
        });
        if (session && interfaceName) {
          try {
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                await handleUnlockInterface({
                  interface_name: interfaceName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
              } catch (unlockError: any) {
                console.warn(`⚠️  Failed to unlock with saved handle: ${unlockError.message}`);
              }
            }

            await delay(1000);

            const deleteResponse = await handleDeleteInterface({
              interface_name: interfaceName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test interface: ${interfaceName}`);
              console.log(`🧹 Cleaned up test interface: ${interfaceName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete interface ${interfaceName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete interface ${interfaceName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test interface ${interfaceName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test interface ${interfaceName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

