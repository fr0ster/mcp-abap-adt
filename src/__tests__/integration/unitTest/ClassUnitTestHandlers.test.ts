/**
 * Integration tests for Class Unit Test Handlers
 *
 * Tests all low-level handlers for Class Unit Tests:
 * - LockClassTestClassesLow - Lock test classes include
 * - UpdateClassTestClassesLow - Update test classes include
 * - UnlockClassTestClassesLow - Unlock test classes include
 * - ActivateClassTestClassesLow - Activate test classes include
 * - RunClassUnitTestsLow - Run ABAP Unit tests
 * - GetClassUnitTestStatusLow - Get test run status
 * - GetClassUnitTestResultLow - Get test run result
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/unitTest/ClassUnitTestHandlers
 */

import { handleGetSession } from '../../../handlers/system/readonly/handleGetSession';
import { handleLockClassTestClasses } from '../../../handlers/class/low/handleLockClassTestClasses';
import { handleUpdateClassTestClasses } from '../../../handlers/class/low/handleUpdateClassTestClasses';
import { handleUnlockClassTestClasses } from '../../../handlers/class/low/handleUnlockClassTestClasses';
import { handleActivateClassTestClasses } from '../../../handlers/class/low/handleActivateClassTestClasses';
import { handleRunClassUnitTests } from '../../../handlers/class/low/handleRunClassUnitTests';
import { handleGetClassUnitTestStatus } from '../../../handlers/class/low/handleGetClassUnitTestStatus';
import { handleGetClassUnitTestResult } from '../../../handlers/class/low/handleGetClassUnitTestResult';

import {
  parseHandlerResponse,
  extractSessionState,
  extractLockHandle,
  delay,
  debugLog
} from '../helpers/testHelpers';
import {
  createTestConnectionAndSession,
  updateSessionFromResponse,
  extractLockSession,
  SessionInfo
} from '../helpers/sessionHelpers';
import { AbapConnection } from '@mcp-abap-adt/connection';
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

const testLogger = createTestLogger('class-unittest');

describe('Class Unit Test Handlers Integration', () => {
  let connection: AbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      // Load environment variables and refresh tokens if needed
      await loadTestEnv();

      // Create connection and session
      const { connection: testConnection, session: testSession } = await createTestConnectionAndSession();
      connection = testConnection;
      session = testSession;
      hasConfig = true;
    } catch (error) {
      if (process.env.DEBUG_TESTS === 'true' || process.env.FULL_LOG_LEVEL === 'true') {
        testLogger.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      }
      hasConfig = false;
    }
  });

  describe('Full Workflow', () => {
    let testCase: any = null;
    let testClassName: string | null = null;
    let containerClassName: string | null = null;

    beforeEach(async () => {
      if (!hasConfig || !session) {
        return;
      }

      // Get test case configuration
      testCase = getEnabledTestCase('class_unit_test', 'full_workflow');
      if (!testCase) {
        return;
      }

      containerClassName = testCase.params.container_class_name;
      testClassName = testCase.params.test_class_name;
    });

    it('should execute full workflow: Lock → Update → Unlock → Activate → Run → GetStatus → GetResult', async () => {
      if (!hasConfig || !connection || !session || !testCase || !containerClassName || !testClassName) {
        debugLog('TEST_SKIP', 'Skipping test: No configuration or test case', {
          hasConfig,
          hasSession: !!session,
          hasTestCase: !!testCase,
          hasContainerClassName: !!containerClassName,
          hasTestClassName: !!testClassName
        });
        testLogger.info('⏭️  Skipping test: No configuration or test case');
        return;
      }

      const containerClass = containerClassName;
      const testClass = testClassName;
      const testClassSource = testCase.params.test_class_source || `CLASS ${testClass} DEFINITION FINAL
  FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.

  PRIVATE SECTION.
    METHODS test_method FOR TESTING.
ENDCLASS.

CLASS ${testClass} IMPLEMENTATION.
  METHOD test_method.
    cl_abap_unit_assert=>assert_true( abap_true ).
  ENDMETHOD.
ENDCLASS.`;

      debugLog('TEST_START', `Starting unit test workflow for class: ${containerClass}`, {
        containerClass,
        testClass,
        testClassSourceLength: testClassSource.length
      });

      // Track lock state for cleanup
      let testClassesLockHandle: string | null = null;
      let testClassesLockSession: SessionInfo | null = null;
      let testClassesLocked = false;
      let runId: string | null = null;
      const diagnosticsTracker = createDiagnosticsTracker('class_unit_test_full_workflow', testCase, session, {
        handler: 'class_unit_test',
        object_name: containerClass
      });

      try {
        // Step 1: Lock test classes
        debugLog('LOCK_TEST_CLASSES', `Starting lock for test classes of ${containerClass}`, {
          session_id: session.session_id,
          has_session_state: !!session.session_state
        });
        const lockResponse = await handleLockClassTestClasses({connection, logger: testLogger}, {
          class_name: containerClass,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (lockResponse.isError) {
          throw new Error(`Lock test classes failed: ${lockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const lockData = parseHandlerResponse(lockResponse);
        testClassesLockHandle = lockData.test_classes_lock_handle;
        testClassesLocked = true;

        // Extract session from Lock response
        testClassesLockSession = {
          session_id: lockData.session_id || session.session_id,
          session_state: lockData.session_state || session.session_state
        };

        diagnosticsTracker.persistLock(testClassesLockSession, testClassesLockHandle, {
          object_type: 'CLAS',
          object_name: containerClass
        });

        expect(testClassesLockHandle).toBeDefined();
        expect(testClassesLockSession.session_id).toBeDefined();
        expect(testClassesLockSession.session_state).toBeDefined();

        debugLog('LOCK_TEST_CLASSES', 'Test classes locked successfully', {
          lock_handle: testClassesLockHandle,
          lock_session_id: testClassesLockSession.session_id
        });

        await delay(getOperationDelay('lock', testCase));

        // Step 2: Update test classes
        debugLog('UPDATE_TEST_CLASSES', `Starting update for test classes of ${containerClass}`, {
          lock_handle: testClassesLockHandle,
          session_id: testClassesLockSession.session_id,
          testClassSourceLength: testClassSource.length
        });
        const updateResponse = await handleUpdateClassTestClasses({connection, logger: testLogger}, {
          class_name: containerClass,
          test_class_source: testClassSource,
          lock_handle: testClassesLockHandle!,
          session_id: testClassesLockSession.session_id,
          session_state: testClassesLockSession.session_state
        });

        if (updateResponse.isError) {
          throw new Error(`Update test classes failed: ${updateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);

        debugLog('UPDATE_TEST_CLASSES', 'Test classes updated successfully', {
          update_success: updateData.success
        });

        await delay(getOperationDelay('update', testCase));

        // Step 3: Unlock test classes
        debugLog('UNLOCK_TEST_CLASSES', `Starting unlock for test classes of ${containerClass}`, {
          lock_handle: testClassesLockHandle,
          session_id: testClassesLockSession.session_id
        });
        const unlockResponse = await handleUnlockClassTestClasses({connection, logger: testLogger}, {
          class_name: containerClass,
          lock_handle: testClassesLockHandle!,
          session_id: testClassesLockSession.session_id,
          session_state: testClassesLockSession.session_state
        });

        if (unlockResponse.isError) {
          throw new Error(`Unlock test classes failed: ${unlockResponse.content[0]?.text || 'Unknown error'}`);
        }

        const unlockData = parseHandlerResponse(unlockResponse);
        expect(unlockData.success).toBe(true);
        testClassesLocked = false;

        // Update session from unlock response
        session = updateSessionFromResponse(session, unlockData);

        debugLog('UNLOCK_TEST_CLASSES', 'Test classes unlocked successfully', {
          unlock_success: unlockData.success
        });

        await delay(getOperationDelay('unlock', testCase));

        // Step 4: Activate test classes
        debugLog('ACTIVATE_TEST_CLASSES', `Starting activation for test classes of ${containerClass}`, {
          session_id: session.session_id,
          test_class: testClass
        });
        const activateResponse = await handleActivateClassTestClasses({connection, logger: testLogger}, {
          class_name: containerClass,
          test_class_name: testClass,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (activateResponse.isError) {
          throw new Error(`Activate test classes failed: ${activateResponse.content[0]?.text || 'Unknown error'}`);
        }

        const activateData = parseHandlerResponse(activateResponse);
        expect(activateData.success).toBe(true);

        debugLog('ACTIVATE_TEST_CLASSES', 'Test classes activated successfully', {
          activate_success: activateData.success
        });

        await delay(getOperationDelay('activate', testCase));

        // Step 5: Run unit tests
        debugLog('RUN_UNIT_TESTS', `Starting unit test run for ${containerClass}`, {
          session_id: session.session_id,
          container_class: containerClass,
          test_class: testClass
        });
        const runResponse = await handleRunClassUnitTests({connection, logger: testLogger}, {
          tests: [{
            container_class: containerClass,
            test_class: testClass
          }],
          title: `Unit test run for ${containerClass}`,
          session_id: session.session_id,
          session_state: session.session_state
        });

        if (runResponse.isError) {
          throw new Error(`Run unit tests failed: ${runResponse.content[0]?.text || 'Unknown error'}`);
        }

        const runData = parseHandlerResponse(runResponse);
        runId = runData.run_id;
        expect(runData.success).toBe(true);
        expect(runId).toBeDefined();

        // Update session from run response
        session = updateSessionFromResponse(session, runData);

        debugLog('RUN_UNIT_TESTS', 'Unit test run started successfully', {
          run_id: runId,
          run_success: runData.success
        });

        // Wait for test run to complete
        await delay(5000); // Wait 5 seconds for test run to start

        // Step 6: Get test run status
        if (runId) {
          debugLog('GET_TEST_STATUS', `Getting test run status for run_id: ${runId}`, {
            session_id: session.session_id,
            run_id: runId
          });
          const statusResponse = await handleGetClassUnitTestStatus({connection, logger: testLogger}, {
            run_id: runId,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!statusResponse.isError) {
            const statusData = parseHandlerResponse(statusResponse);
            debugLog('GET_TEST_STATUS', 'Test run status retrieved', {
              run_id: runId,
              status: statusData.status || 'unknown'
            });
          } else {
            debugLog('GET_TEST_STATUS', 'Failed to get test run status', {
              run_id: runId,
              error: statusResponse.content[0]?.text || 'Unknown error'
            });
          }
        }

        // Step 7: Get test run result
        if (runId) {
          // Wait additional time for test run to complete
          await delay(10000);

          debugLog('GET_TEST_RESULT', `Getting test run result for run_id: ${runId}`, {
            session_id: session.session_id,
            run_id: runId
          });
          const resultResponse = await handleGetClassUnitTestResult({connection, logger: testLogger}, {
            run_id: runId,
            session_id: session.session_id,
            session_state: session.session_state
          });

          if (!resultResponse.isError) {
            const resultData = parseHandlerResponse(resultResponse);
            debugLog('GET_TEST_RESULT', 'Test run result retrieved', {
              run_id: runId,
              has_result: !!resultData.result
            });
          } else {
            debugLog('GET_TEST_RESULT', 'Failed to get test run result', {
              run_id: runId,
              error: resultResponse.content[0]?.text || 'Unknown error'
            });
          }
        }

        debugLog('TEST_COMPLETE', `Full unit test workflow completed successfully for ${containerClass}`, {
          containerClass,
          testClass,
          runId
        });

        testLogger.info(`✅ Full unit test workflow completed successfully for ${containerClass}`);

      } catch (error: any) {
        // Principle 1: If lock was done, unlock is mandatory
        if (testClassesLockHandle && testClassesLockSession && testClassesLocked) {
          try {
            debugLog('CLEANUP_ON_ERROR', `Attempting to unlock test classes ${containerClass} after error`, {
              lock_handle: testClassesLockHandle,
              session_id: testClassesLockSession.session_id
            });
            await handleUnlockClassTestClasses({connection, logger: testLogger}, {
              class_name: containerClass!,
              lock_handle: testClassesLockHandle,
              session_id: testClassesLockSession.session_id,
              session_state: testClassesLockSession.session_state
            });
            debugLog('CLEANUP_ON_ERROR', `Successfully unlocked test classes ${containerClass} after error`);
          } catch (unlockError) {
            debugLog('CLEANUP_ON_ERROR', `Failed to unlock test classes ${containerClass} after error`, {
              unlockError: unlockError instanceof Error ? unlockError.message : String(unlockError)
            });
            testLogger.error('Failed to unlock test classes after error:', unlockError);
          }
        }

        debugLog('TEST_ERROR', `Test failed: ${error.message}`, {
          error: error.message,
          stack: error.stack?.substring(0, 500)
        });
        testLogger.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock is always required if test classes were locked
        // For diagnostics: deletion is excluded, only unlock is performed
        if (session && containerClass) {
          try {
            // Principle 1: If lock was done, unlock is mandatory
            if (testClassesLockHandle && testClassesLockSession && testClassesLocked) {
              try {
                debugLog('CLEANUP', `Attempting to unlock test classes ${containerClass} (cleanup)`, {
                  lock_handle: testClassesLockHandle,
                  session_id: testClassesLockSession.session_id
                });
                await handleUnlockClassTestClasses({connection, logger: testLogger}, {
                  class_name: containerClass,
                  lock_handle: testClassesLockHandle,
                  session_id: testClassesLockSession.session_id,
                  session_state: testClassesLockSession.session_state
                });
                debugLog('CLEANUP', `Successfully unlocked test classes ${containerClass} (cleanup)`);
                testLogger.info(`🔓 Unlocked test classes ${containerClass} (cleanup)`);
              } catch (unlockError: any) {
                debugLog('CLEANUP', `Failed to unlock test classes ${containerClass} (cleanup)`, {
                  error: unlockError instanceof Error ? unlockError.message : String(unlockError)
                });
                testLogger.warn(`⚠️  Failed to unlock test classes ${containerClass} during cleanup: ${unlockError.message || unlockError}`);
              }
            }

            // Deletion is excluded for diagnostics - object left for analysis
            debugLog('CLEANUP', `Deletion excluded for diagnostics - object left for analysis: ${containerClass}`, {
              container_class: containerClass,
              test_class: testClass,
              test_classes_locked: testClassesLocked
            });
            testLogger.info(`⚠️ Deletion excluded for diagnostics - object left for analysis: ${containerClass}`);
          } catch (cleanupError) {
            debugLog('CLEANUP_ERROR', `Exception during cleanup: ${cleanupError}`, {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
            testLogger.warn(`⚠️  Failed to cleanup test class ${containerClass}: ${cleanupError}`);
          }
        }

        diagnosticsTracker.cleanup();
      }
    }, getTimeout('long'));
  });
});
