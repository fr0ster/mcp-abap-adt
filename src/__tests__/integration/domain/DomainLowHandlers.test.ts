/**
 * Integration tests for Domain Low-Level Handlers
 *
 * Tests the complete workflow using handler functions directly:
 * GetSession → ValidateDomainLow → CreateDomainLow → LockDomainLow →
 * UpdateDomainLow → UnlockDomainLow → ActivateDomainLow → DeleteDomainLow
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/domain
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleValidateDomain } from '../../../handlers/domain/low/handleValidateDomain';
import { handleCreateDomain } from '../../../handlers/domain/low/handleCreateDomain';
import { handleLockDomain } from '../../../handlers/domain/low/handleLockDomain';
import { handleUpdateDomain } from '../../../handlers/domain/low/handleUpdateDomain';
import { handleUnlockDomain } from '../../../handlers/domain/low/handleUnlockDomain';
import { handleActivateDomain } from '../../../handlers/domain/low/handleActivateDomain';
import { handleDeleteDomain } from '../../../handlers/domain/low/handleDeleteDomain';

import {
  parseHandlerResponse,
  extractSessionState,
  extractLockHandle,
  isSuccessResponse,
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
  loadTestEnv
} from '../helpers/configHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

describe('Domain Low-Level Handlers Integration', () => {
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

  afterAll(async () => {
    // Cleanup will be done in individual tests
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testDomainName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('create_domain_low', 'full_workflow');
      if (!testCase) {
        return;
      }

      testDomainName = testCase.params.domain_name;
    });

    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !session || !testCase || !testDomainName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasTestDomainName: !!testDomainName
        });
        console.log('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const domainName = testDomainName;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test domain for low-level handler`;

      debugLog('TEST_START', `Starting full workflow test for domain: ${domainName}`, {
        domainName,
        packageName,
        transportRequest,
        description
      });

      // Variables for cleanup (in case test fails)
      let lockHandleForCleanup: string | null = null;
      let lockSessionForCleanup: SessionInfo | null = null;

      try {
        // Step 1: Validate
        debugLog('VALIDATE', `Starting validation for ${domainName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const validateResponse = await handleValidateDomain({
          domain_name: domainName,
          description: description,
          package_name: packageName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (validateResponse.isError) {
          const errorMsg = validateResponse.content[0]?.text || 'Unknown error';
          debugLog('VALIDATE_ERROR', `Validation returned error: ${errorMsg}`, {
            error: errorMsg,
            response: validateResponse
          });
          // If domain already exists, that's okay - we'll skip creation
          // Cleanup will be done in finally block
          if (errorMsg.includes('already exists')) {
            console.log(`⏭️  Domain ${domainName} already exists, skipping test`);
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
          throw new Error(`Validation failed: ${validateData.validation_result?.message || 'Invalid domain name'}`);
        }

        // Update session from validation response
        const oldSessionId = session.session_id;
        session = updateSessionFromResponse(session, validateData);
        debugLog('VALIDATE', 'Session updated', {
          old_session_id: oldSessionId,
          new_session_id: session.session_id,
          session_changed: oldSessionId !== session.session_id
        });

        // Step 2: Create
        debugLog('CREATE', `Starting creation for ${domainName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const createResponse = await handleCreateDomain({
          domain_name: domainName,
          description,
          package_name: packageName,
          transport_request: transportRequest,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (createResponse.isError) {
          debugLog('CREATE_ERROR', `Create returned error: ${createResponse.content[0]?.text || 'Unknown error'}`, {
            response: createResponse
          });
          throw new Error(`Create failed: ${createResponse.content[0]?.text || 'Unknown error'}`);
        }

        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        expect(createData.domain_name).toBe(domainName);

        // Update session from create response
        const oldSessionId2 = session.session_id;
        session = updateSessionFromResponse(session, createData);
        debugLog('CREATE', 'Session updated', {
          old_session_id: oldSessionId2,
          new_session_id: session.session_id,
          session_changed: oldSessionId2 !== session.session_id
        });

        // Wait for creation to complete
        await delay(getOperationDelay('create', testCase));

        // Step 3: Lock
        debugLog('LOCK', `Starting lock for ${domainName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state,
          session_state_cookies: session.session_state?.cookies?.substring(0, 50) + '...'
        });
        const lockResponse = await handleLockDomain({
          domain_name: domainName,
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

        // CRITICAL: Extract session from Lock response
        const lockSession = extractLockSession(lockData);

        // CRITICAL: Verify Lock returned session_id and session_state
        expect(lockSession.session_id).toBeDefined();
        expect(lockSession.session_state).toBeDefined();
        expect(lockSession.session_state?.cookies).toBeDefined();
        expect(lockSession.session_state?.csrf_token).toBeDefined();

        // Save for cleanup in case test fails
        lockHandleForCleanup = lockHandle;
        lockSessionForCleanup = lockSession;

        debugLog('LOCK', 'Lock completed, extracted session', {
          lock_handle: lockHandle,
          lock_session_id: lockSession.session_id,
          has_lock_session_state: !!lockSession.session_state,
          lock_session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          lock_session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...',
          session_from_lock: JSON.stringify(lockSession, null, 2)
        });

        // Wait for lock to complete
        await delay(getOperationDelay('lock', testCase));

        // Step 4: Update
        const properties = testCase.params.properties || {
          description: `${description} (updated)`,
          datatype: testCase.params.datatype || 'CHAR',
          length: testCase.params.length || 10
        };
        // Add packageName (camelCase) to properties (required by DomainBuilder.update)
        properties.packageName = packageName;
        // Also add package_name for compatibility
        properties.package_name = packageName;

        debugLog('UPDATE', `Starting update for ${domainName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          has_session_state: !!lockSession.session_state,
          session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...',
          properties: properties
        });

        const updateResponse = await handleUpdateDomain({
          domain_name: domainName,
          properties,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (updateResponse.isError) {
          debugLog('UPDATE_ERROR', `Update returned error: ${updateResponse.content[0]?.text || 'Unknown error'}`, {
            response: updateResponse
          });
          throw new Error(`Update failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);

        // CRITICAL: Verify Update used the same session_id as Lock
        expect(updateData.session_id).toBe(lockSession.session_id);
        debugLog('UPDATE', 'Update completed successfully', {
          update_success: updateData.success,
          update_session_id: updateData.session_id,
          lock_session_id: lockSession.session_id,
          sessions_match: updateData.session_id === lockSession.session_id
        });

        // Wait for update to complete
        await delay(getOperationDelay('update', testCase));

        // Step 5: Unlock
        debugLog('UNLOCK', `Starting unlock for ${domainName}`, {
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          has_session_state: !!lockSession.session_state,
          session_state_cookies: lockSession.session_state?.cookies?.substring(0, 50) + '...',
          session_state_csrf: lockSession.session_state?.csrf_token?.substring(0, 20) + '...'
        });

        const unlockResponse = await handleUnlockDomain({
          domain_name: domainName,
          lock_handle: lockHandle,
          session_id: lockSession.session_id,  // ← From Lock response
          session_state: lockSession.session_state  // ← From Lock response
        });

        if (unlockResponse.isError) {
          debugLog('UNLOCK_ERROR', `Unlock returned error: ${unlockResponse.content[0]?.text || 'Unknown error'}`, {
            response: unlockResponse
          });
          throw new Error(`Unlock failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);

        // CRITICAL: Verify Unlock used the same session_id as Lock
        expect(unlockData.session_id).toBe(lockSession.session_id);
        debugLog('UNLOCK', 'Unlock completed successfully', {
          unlock_success: unlockData.success,
          unlock_session_id: unlockData.session_id,
          lock_session_id: lockSession.session_id,
          sessions_match: unlockData.session_id === lockSession.session_id
        });

        // Update session from unlock response
        const oldSessionId3 = session.session_id;
        session = updateSessionFromResponse(session, unlockData);
        debugLog('UNLOCK', 'Session updated', {
          old_session_id: oldSessionId3,
          new_session_id: session.session_id,
          session_changed: oldSessionId3 !== session.session_id
        });

        // Wait for unlock to complete
        await delay(getOperationDelay('unlock', testCase));

        // Step 6: Activate
        debugLog('ACTIVATE', `Starting activation for ${domainName}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const activateResponse = await handleActivateDomain({
          domain_name: domainName,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          debugLog('ACTIVATE_ERROR', `Activate returned error: ${activateResponse.content[0]?.text || 'Unknown error'}`, {
            response: activateResponse
          });
          throw new Error(`Activate failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);
        debugLog('ACTIVATE', 'Activation completed successfully', {
          activate_success: activateData.success
        });

        debugLog('TEST_COMPLETE', `Full workflow completed successfully for ${domainName}`, {
          domainName,
          steps_completed: ['validate', 'create', 'lock', 'update', 'unlock', 'activate']
        });
        console.log(`✅ Full workflow completed successfully for ${domainName}`);

      } catch (error: any) {
        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          domainName
        });
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and delete test domain
        debugLog('CLEANUP', `Starting cleanup for ${domainName}`, {
          domainName,
          hasSession: !!session
        });
        if (session && domainName) {
          try {
            // Try to unlock first if we have lock handle from the test
            if (lockHandleForCleanup && lockSessionForCleanup) {
              try {
                debugLog('CLEANUP', `Unlocking domain ${domainName} before deletion`, {
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id
                });
                await handleUnlockDomain({
                  domain_name: domainName,
                  lock_handle: lockHandleForCleanup,
                  session_id: lockSessionForCleanup.session_id,
                  session_state: lockSessionForCleanup.session_state
                });
                debugLog('CLEANUP', `Successfully unlocked domain ${domainName}`);
              } catch (unlockError: any) {
                // If unlock fails, try to get new lock and unlock
                console.warn(`⚠️  Failed to unlock with saved handle, trying to get new lock: ${unlockError.message}`);
                try {
                  const lockResponse = await handleLockDomain({
                    domain_name: domainName,
                    session_id: session.session_id,
                    session_state: session.session_state
                  });
                  if (!lockResponse.isError) {
                    const lockData = parseHandlerResponse(lockResponse);
                    const cleanupLockHandle = extractLockHandle(lockData);
                    const cleanupLockSession = extractLockSession(lockData);

                    await handleUnlockDomain({
                      domain_name: domainName,
                      lock_handle: cleanupLockHandle,
                      session_id: cleanupLockSession.session_id,
                      session_state: cleanupLockSession.session_state
                    });
                    debugLog('CLEANUP', `Successfully unlocked domain ${domainName} with new lock`);
                  }
                } catch (e) {
                  console.warn(`⚠️  Failed to unlock domain ${domainName} during cleanup: ${e}`);
                }
              }
            } else {
              // No lock handle saved, try to get lock and unlock
              try {
                const lockResponse = await handleLockDomain({
                  domain_name: domainName,
                  session_id: session.session_id,
                  session_state: session.session_state
                });
                if (!lockResponse.isError) {
                  const lockData = parseHandlerResponse(lockResponse);
                  const cleanupLockHandle = extractLockHandle(lockData);
                  const cleanupLockSession = extractLockSession(lockData);

                  await handleUnlockDomain({
                    domain_name: domainName,
                    lock_handle: cleanupLockHandle,
                    session_id: cleanupLockSession.session_id,
                    session_state: cleanupLockSession.session_state
                  });
                }
              } catch (e) {
                // Ignore unlock errors during cleanup
                console.warn(`⚠️  Could not unlock domain ${domainName} during cleanup: ${e}`);
              }
            }

            // Wait a bit before deletion
            await delay(1000);

            // Delete domain
            debugLog('CLEANUP', `Deleting domain ${domainName}`);
            const deleteResponse = await handleDeleteDomain({
              domain_name: domainName,
              transport_request: transportRequest
            });

            if (!deleteResponse.isError) {
              debugLog('CLEANUP', `Successfully deleted test domain: ${domainName}`);
              console.log(`🧹 Cleaned up test domain: ${domainName}`);
            } else {
              const errorMsg = deleteResponse.content[0]?.text || 'Unknown error';
              debugLog('CLEANUP_ERROR', `Failed to delete domain ${domainName}`, {
                error: errorMsg
              });
              console.warn(`⚠️  Failed to delete domain ${domainName}: ${errorMsg}`);
            }
          } catch (cleanupError: any) {
            debugLog('CLEANUP_ERROR', `Failed to cleanup test domain ${domainName}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            console.warn(`⚠️  Failed to cleanup test domain ${domainName}: ${cleanupError.message || cleanupError}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});

