/**
 * Integration tests for Function Low-Level Handlers (FUGR + FM)
 *
 * Tests the complete workflow for both Function Group and Function Module:
 * 1. FUGR: Validate → Create → Lock → Unlock → Activate
 * 2. FM: Validate → Create → Lock → Update → Unlock → Activate
 * 3. Cleanup: Delete FM → Delete FUGR
 *
 * Enable debug logs:
 *   DEBUG_ADT_TESTS=true       - Test execution logs
 *   DEBUG_ADT_LIBS=true        - Library logs
 *   DEBUG_CONNECTORS=true      - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/function/FunctionLowHandlers
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleActivateFunctionGroup } from '../../../../handlers/function/low/handleActivateFunctionGroup';
import { handleActivateFunctionModule } from '../../../../handlers/function/low/handleActivateFunctionModule';
import { handleCreateFunctionGroup } from '../../../../handlers/function/low/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../../../handlers/function/low/handleCreateFunctionModule';
import { handleDeleteFunctionGroup } from '../../../../handlers/function/low/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../../../handlers/function/low/handleDeleteFunctionModule';
import { handleLockFunctionGroup } from '../../../../handlers/function/low/handleLockFunctionGroup';
import { handleLockFunctionModule } from '../../../../handlers/function/low/handleLockFunctionModule';
import { handleUnlockFunctionGroup } from '../../../../handlers/function/low/handleUnlockFunctionGroup';
import { handleUnlockFunctionModule } from '../../../../handlers/function/low/handleUnlockFunctionModule';
import { handleUpdateFunctionModule } from '../../../../handlers/function/low/handleUpdateFunctionModule';
import { handleValidateFunctionGroup } from '../../../../handlers/function/low/handleValidateFunctionGroup';
import { handleValidateFunctionModule } from '../../../../handlers/function/low/handleValidateFunctionModule';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getTimeout,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createDiagnosticsTracker } from '../../helpers/persistenceHelpers';
import {
  createTestConnectionAndSession,
  extractLockSession,
  type SessionInfo,
  updateSessionFromResponse,
} from '../../helpers/sessionHelpers';
import {
  callTool,
  createHardModeClient,
  isHardModeEnabled,
} from '../../helpers/testers/hardMode';
import {
  debugLog,
  delay,
  extractLockHandle,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

describe('Function Low-Level Handlers Integration (FUGR + FM)', () => {
  let connection: AbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;
  const testLogger = createTestLogger('function-low');
  let mcp: {
    client: any;
    toolNames: Set<string>;
    close: () => Promise<void>;
  } | null = null;

  beforeAll(async () => {
    try {
      if (isHardModeEnabled()) {
        mcp = await createHardModeClient();
        // Get session through MCP
        const sessionResponse = await callTool(
          mcp.client,
          mcp.toolNames,
          ['GetSession'],
          {},
        );
        const sessionData = parseHandlerResponse(sessionResponse);
        session = {
          session_id:
            sessionData.session_id || sessionData.data?.session_id || '',
          session_state:
            sessionData.session_state || sessionData.data?.session_state || '',
        };
        hasConfig = true;
        return;
      }
      const { connection: testConnection, session: testSession } =
        await createTestConnectionAndSession();
      connection = testConnection;
      session = testSession;
      hasConfig = true;
    } catch (error) {
      if (
        process.env.DEBUG_TESTS === 'true' ||
        process.env.FULL_LOG_LEVEL === 'true'
      ) {
        testLogger?.warn(
          '⚠️ Skipping tests: No .env file or SAP configuration found',
        );
      }
      hasConfig = false;
    }
  });

  afterAll(async () => {
    if (mcp) {
      await mcp.close();
      mcp = null;
    }
  });

  describe('Full Workflow (FUGR + FM)', () => {
    it(
      'should execute full workflow: FUGR (V→C→L→U→A) then FM (V→C→L→U→U→A)',
      async () => {
        if (!hasConfig || (!isHardModeEnabled() && (!connection || !session))) {
          testLogger?.info(
            '⏭️  Skipping test: No configuration, connection or session',
          );
          return;
        }

        const testCase = getEnabledTestCase('create_function', 'full_workflow');
        if (!testCase) {
          testLogger?.info('⏭️  Skipping test: No test case configuration');
          return;
        }

        const invoke = async (
          toolName: string,
          args: Record<string, unknown>,
          directCall: () => Promise<any>,
        ) => {
          if (!isHardModeEnabled()) {
            return directCall();
          }
          if (!mcp) {
            throw new Error('Hard mode MCP client is not initialized');
          }
          // Remove null/empty session_state to avoid schema validation errors
          // (low-level tools define session_state as type: 'object')
          const cleanArgs = { ...args };
          if (!cleanArgs.session_state) {
            delete cleanArgs.session_state;
          }
          try {
            return await callTool(
              mcp.client,
              mcp.toolNames,
              [toolName],
              cleanArgs,
            );
          } catch (error: any) {
            return {
              isError: true,
              content: [
                { type: 'text', text: error?.message || String(error) },
              ],
            };
          }
        };

        const functionGroupName = testCase.params.function_group_name;
        const functionModuleName = testCase.params.function_module_name;
        const packageName = resolvePackageName(testCase);
        const transportRequest = resolveTransportRequest(testCase);

        // Pre-cleanup: Remove leftover objects from previous failed tests
        // This ensures tests start with a clean state even if previous test failed
        const shouldCleanup = getCleanupAfter(testCase);
        if (shouldCleanup) {
          try {
            testLogger?.debug(
              '🧹 Running pre-cleanup (removing leftover objects)...',
            );

            // Try to delete FM first (if exists)
            try {
              await invoke(
                'DeleteFunctionModuleLow',
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  transport_request: transportRequest,
                },
                () =>
                  handleDeleteFunctionModule(
                    { connection, logger: testLogger },
                    {
                      function_module_name: functionModuleName,
                      function_group_name: functionGroupName,
                      transport_request: transportRequest,
                    },
                  ),
              );
              testLogger?.debug(
                `✅ Pre-cleanup: deleted leftover FM ${functionModuleName}`,
              );
            } catch (error: any) {
              // FM might not exist - ignore
              testLogger?.debug(
                `⚠️ Pre-cleanup: FM ${functionModuleName} not found (ignored)`,
              );
            }

            // Try to delete FUGR (if exists)
            try {
              await invoke(
                'DeleteFunctionGroupLow',
                {
                  function_group_name: functionGroupName,
                  transport_request: transportRequest,
                },
                () =>
                  handleDeleteFunctionGroup(
                    { connection, logger: testLogger },
                    {
                      function_group_name: functionGroupName,
                      transport_request: transportRequest,
                    },
                  ),
              );
              testLogger?.debug(
                `✅ Pre-cleanup: deleted leftover FUGR ${functionGroupName}`,
              );
            } catch (error: any) {
              // FUGR might not exist - ignore
              testLogger?.debug(
                `⚠️ Pre-cleanup: FUGR ${functionGroupName} not found (ignored)`,
              );
            }

            testLogger?.debug('✅ Pre-cleanup completed');
          } catch (error: any) {
            // Pre-cleanup errors are non-fatal - objects might not exist
            testLogger?.debug(
              `⚠️ Pre-cleanup warning (ignored): ${error?.message || String(error)}`,
            );
          }
        }

        const functionGroupDescription =
          testCase.params.function_group_description || functionGroupName;
        const functionModuleDescription =
          testCase.params.function_module_description || functionModuleName;
        const sourceCode = testCase.params.source_code;
        const updateSourceCode = testCase.params.update_source_code;

        if (!sourceCode) {
          throw new Error('source_code is required in test configuration');
        }

        const diagnosticsTracker = createDiagnosticsTracker(
          'function_low_full_workflow',
          testCase,
          session,
          {
            handler: 'create_function_low',
            object_name: `${functionGroupName}/${functionModuleName}`,
          },
        );

        let fgLockHandle: string | null = null;
        let fgLockSession: SessionInfo | null = null;
        let fmLockHandle: string | null = null;
        let fmLockSession: SessionInfo | null = null;

        try {
          // ==================== PART 1: Function Group ====================
          testLogger?.info(
            `📦 [FUGR] Starting function group workflow: ${functionGroupName}`,
          );

          // Step 1.1: Validate FUGR
          debugLog('FUGR-VALIDATE', `Validating ${functionGroupName}`);
          const validateFGResponse = await invoke(
            'ValidateFunctionGroupLow',
            {
              function_group_name: functionGroupName,
              package_name: packageName,
              description: functionGroupDescription,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleValidateFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  package_name: packageName,
                  description: functionGroupDescription,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (validateFGResponse.isError) {
            const errorMsg =
              validateFGResponse.content[0]?.text || 'Unknown error';
            if (errorMsg.includes('already exists')) {
              testLogger?.info(
                `⏭️  Function group ${functionGroupName} already exists, skipping test`,
              );
              return;
            }
            testLogger?.error(`FUGR validation failed: ${errorMsg}`);
            throw new Error(`FUGR validation failed: ${errorMsg}`);
          }

          const validateFGData = parseHandlerResponse(validateFGResponse);
          session = updateSessionFromResponse(session, validateFGData);
          await delay(getOperationDelay('validate', testCase));

          // Step 1.2: Create FUGR
          debugLog('FUGR-CREATE', `Creating ${functionGroupName}`);
          const createFGResponse = await invoke(
            'CreateFunctionGroupLow',
            {
              function_group_name: functionGroupName,
              description: functionGroupDescription,
              package_name: packageName,
              transport_request: transportRequest,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleCreateFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  description: functionGroupDescription,
                  package_name: packageName,
                  transport_request: transportRequest,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (createFGResponse.isError) {
            const errorMsg =
              createFGResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FUGR create failed: ${errorMsg}`);
            throw new Error(`FUGR create failed: ${errorMsg}`);
          }

          const createFGData = parseHandlerResponse(createFGResponse);
          session = updateSessionFromResponse(session, createFGData);
          await delay(getOperationDelay('create', testCase));

          // Step 1.3: Lock FUGR
          debugLog('FUGR-LOCK', `Locking ${functionGroupName}`);
          const lockFGResponse = await invoke(
            'LockFunctionGroupLow',
            {
              function_group_name: functionGroupName,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleLockFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (lockFGResponse.isError) {
            const errorMsg = lockFGResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FUGR lock failed: ${errorMsg}`);
            throw new Error(`FUGR lock failed: ${errorMsg}`);
          }

          const lockFGData = parseHandlerResponse(lockFGResponse);
          fgLockHandle = extractLockHandle(lockFGData);
          // Use updateSessionFromResponse instead of extractLockSession to avoid error if session not in response
          session = updateSessionFromResponse(session, lockFGData);
          fgLockSession = session;

          diagnosticsTracker.persistLock(fgLockSession, fgLockHandle, {
            object_type: 'FUGR',
            object_name: functionGroupName,
            transport_request: transportRequest,
          });

          await delay(getOperationDelay('lock', testCase));

          // Step 1.4: Unlock FUGR
          debugLog('FUGR-UNLOCK', `Unlocking ${functionGroupName}`);
          const unlockFGResponse = await invoke(
            'UnlockFunctionGroupLow',
            {
              function_group_name: functionGroupName,
              lock_handle: fgLockHandle,
              session_id: fgLockSession.session_id!,
              session_state: fgLockSession.session_state,
            },
            () =>
              handleUnlockFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  lock_handle: fgLockHandle,
                  session_id: fgLockSession!.session_id!,
                  session_state: fgLockSession!.session_state,
                },
              ),
          );

          if (unlockFGResponse.isError) {
            const errorMsg =
              unlockFGResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FUGR unlock failed: ${errorMsg}`);
            throw new Error(`FUGR unlock failed: ${errorMsg}`);
          }

          const unlockFGData = parseHandlerResponse(unlockFGResponse);
          session = updateSessionFromResponse(session, unlockFGData);
          fgLockHandle = null; // Clear lock handle after unlock
          await delay(getOperationDelay('unlock', testCase));

          // Step 1.5: Activate FUGR
          debugLog('FUGR-ACTIVATE', `Activating ${functionGroupName}`);
          const activateFGResponse = await invoke(
            'ActivateFunctionGroupLow',
            {
              function_group_name: functionGroupName,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleActivateFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (activateFGResponse.isError) {
            const errorMsg =
              activateFGResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FUGR activate failed: ${errorMsg}`);
            throw new Error(`FUGR activate failed: ${errorMsg}`);
          }

          const activateFGData = parseHandlerResponse(activateFGResponse);
          session = updateSessionFromResponse(session, activateFGData);
          testLogger?.info(
            `✅ [FUGR] Function group workflow completed: ${functionGroupName}`,
          );
          await delay(getOperationDelay('activate', testCase));

          // ==================== PART 2: Function Module ====================
          testLogger?.info(
            `📦 [FM] Starting function module workflow: ${functionModuleName}`,
          );

          // Step 2.1: Validate FM
          debugLog('FM-VALIDATE', `Validating ${functionModuleName}`);
          const validateFMResponse = await invoke(
            'ValidateFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              description: functionModuleDescription,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleValidateFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  description: functionModuleDescription,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (validateFMResponse.isError) {
            const errorMsg =
              validateFMResponse.content[0]?.text || 'Unknown error';
            const errorLower = errorMsg.toLowerCase();
            // Skip test if authorization error
            if (
              errorLower.includes('not authorized') ||
              errorLower.includes('authorization') ||
              errorLower.includes('s_abplngvs')
            ) {
              testLogger?.warn(
                `⚠️  Skipping test: No authorization to create function module: ${errorMsg}`,
              );
              return;
            }
            if (errorMsg.includes('already exists')) {
              testLogger?.info(
                `⏭️  Function module ${functionModuleName} already exists, skipping test`,
              );
              return;
            }
            testLogger?.error(`FM validation failed: ${errorMsg}`);
            throw new Error(`FM validation failed: ${errorMsg}`);
          }

          const validateFMData = parseHandlerResponse(validateFMResponse);
          session = updateSessionFromResponse(session, validateFMData);
          await delay(getOperationDelay('validate', testCase));

          // Step 2.2: Create FM
          debugLog('FM-CREATE', `Creating ${functionModuleName}`);
          const createFMResponse = await invoke(
            'CreateFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              description: functionModuleDescription,
              package_name: packageName,
              transport_request: transportRequest,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleCreateFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  description: functionModuleDescription,
                  package_name: packageName,
                  transport_request: transportRequest,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (createFMResponse.isError) {
            const errorMsg =
              createFMResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FM create failed: ${errorMsg}`);
            throw new Error(`FM create failed: ${errorMsg}`);
          }

          const createFMData = parseHandlerResponse(createFMResponse);
          session = updateSessionFromResponse(session, createFMData);
          await delay(getOperationDelay('create', testCase));

          // Step 2.3: Lock FM
          debugLog('FM-LOCK', `Locking ${functionModuleName}`);
          const lockFMResponse = await invoke(
            'LockFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleLockFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (lockFMResponse.isError) {
            const errorMsg = lockFMResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FM lock failed: ${errorMsg}`);
            throw new Error(`FM lock failed: ${errorMsg}`);
          }

          const lockFMData = parseHandlerResponse(lockFMResponse);
          fmLockHandle = extractLockHandle(lockFMData);
          // Use updateSessionFromResponse instead of extractLockSession to avoid error if session not in response
          session = updateSessionFromResponse(session, lockFMData);
          fmLockSession = session;

          diagnosticsTracker.persistLock(fmLockSession, fmLockHandle, {
            object_type: 'FUNC',
            object_name: functionModuleName,
            transport_request: transportRequest,
          });

          await delay(getOperationDelay('lock', testCase));

          // Step 2.4: Update FM (with source code)
          debugLog(
            'FM-UPDATE',
            `Updating ${functionModuleName} with source code`,
          );
          const updateFMResponse = await invoke(
            'UpdateFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              source_code: sourceCode,
              transport_request: transportRequest,
              lock_handle: fmLockHandle,
              session_id: fmLockSession!.session_id!,
              session_state: fmLockSession!.session_state,
            },
            () =>
              handleUpdateFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  source_code: sourceCode,
                  transport_request: transportRequest,
                  lock_handle: fmLockHandle,
                  session_id: fmLockSession!.session_id!,
                  session_state: fmLockSession!.session_state,
                },
              ),
          );

          if (updateFMResponse.isError) {
            const errorMsg =
              updateFMResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FM update failed: ${errorMsg}`);
            throw new Error(`FM update failed: ${errorMsg}`);
          }

          const updateFMData = parseHandlerResponse(updateFMResponse);
          session = updateSessionFromResponse(session, updateFMData);
          await delay(getOperationDelay('update', testCase));

          // Step 2.5: Unlock FM
          debugLog('FM-UNLOCK', `Unlocking ${functionModuleName}`);
          const unlockFMResponse = await invoke(
            'UnlockFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              lock_handle: fmLockHandle,
              session_id: fmLockSession!.session_id!,
              session_state: fmLockSession!.session_state,
            },
            () =>
              handleUnlockFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  lock_handle: fmLockHandle,
                  session_id: fmLockSession!.session_id!,
                  session_state: fmLockSession!.session_state,
                },
              ),
          );

          if (unlockFMResponse.isError) {
            const errorMsg =
              unlockFMResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FM unlock failed: ${errorMsg}`);
            throw new Error(`FM unlock failed: ${errorMsg}`);
          }

          const unlockFMData = parseHandlerResponse(unlockFMResponse);
          session = updateSessionFromResponse(session, unlockFMData);
          fmLockHandle = null; // Clear lock handle after unlock
          await delay(getOperationDelay('unlock', testCase));

          // Step 2.6: Activate FM
          debugLog('FM-ACTIVATE', `Activating ${functionModuleName}`);
          const activateFMResponse = await invoke(
            'ActivateFunctionModuleLow',
            {
              function_module_name: functionModuleName,
              function_group_name: functionGroupName,
              session_id: session!.session_id,
              session_state: session!.session_state,
            },
            () =>
              handleActivateFunctionModule(
                { connection, logger: testLogger },
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  session_id: session!.session_id,
                  session_state: session!.session_state,
                },
              ),
          );

          if (activateFMResponse.isError) {
            const errorMsg =
              activateFMResponse.content[0]?.text || 'Unknown error';
            testLogger?.error(`FM activate failed: ${errorMsg}`);
            throw new Error(`FM activate failed: ${errorMsg}`);
          }

          const activateFMData = parseHandlerResponse(activateFMResponse);
          session = updateSessionFromResponse(session, activateFMData);
          testLogger?.info(
            `✅ [FM] Function module workflow completed: ${functionModuleName}`,
          );
          testLogger?.info(`✅ ✅ Full workflow completed successfully`);
        } catch (error: any) {
          const errorMessage = error.message || String(error);
          let failedStep = 'UNKNOWN';
          if (errorMessage.includes('FUGR validation'))
            failedStep = 'FUGR-VALIDATE';
          else if (errorMessage.includes('FUGR create'))
            failedStep = 'FUGR-CREATE';
          else if (errorMessage.includes('FUGR lock')) failedStep = 'FUGR-LOCK';
          else if (errorMessage.includes('FUGR unlock'))
            failedStep = 'FUGR-UNLOCK';
          else if (errorMessage.includes('FUGR activate'))
            failedStep = 'FUGR-ACTIVATE';
          else if (errorMessage.includes('FM validation'))
            failedStep = 'FM-VALIDATE';
          else if (errorMessage.includes('FM create')) failedStep = 'FM-CREATE';
          else if (errorMessage.includes('FM lock')) failedStep = 'FM-LOCK';
          else if (errorMessage.includes('FM update')) failedStep = 'FM-UPDATE';
          else if (errorMessage.includes('FM unlock')) failedStep = 'FM-UNLOCK';
          else if (errorMessage.includes('FM activate'))
            failedStep = 'FM-ACTIVATE';

          testLogger?.error(`❌ Test failed at ${failedStep}: ${errorMessage}`);
          throw error;
        } finally {
          // Cleanup: Delete FM first, then FUGR
          const shouldCleanup = getCleanupAfter(testCase);

          if (shouldCleanup && session) {
            // Unlock FM if still locked
            if (fmLockHandle && fmLockSession) {
              try {
                await invoke(
                  'UnlockFunctionModuleLow',
                  {
                    function_module_name: functionModuleName,
                    function_group_name: functionGroupName,
                    lock_handle: fmLockHandle,
                    session_id: fmLockSession.session_id!,
                    session_state: fmLockSession.session_state,
                  },
                  () =>
                    handleUnlockFunctionModule(
                      { connection, logger: testLogger },
                      {
                        function_module_name: functionModuleName,
                        function_group_name: functionGroupName,
                        lock_handle: fmLockHandle!,
                        session_id: fmLockSession!.session_id!,
                        session_state: fmLockSession!.session_state,
                      },
                    ),
                );
              } catch (unlockError) {
                // Silent cleanup failure
              }
            }

            // Delete FM
            try {
              await delay(2000);
              const deleteFMResponse = await invoke(
                'DeleteFunctionModuleLow',
                {
                  function_module_name: functionModuleName,
                  function_group_name: functionGroupName,
                  transport_request: transportRequest,
                },
                () =>
                  handleDeleteFunctionModule(
                    { connection, logger: testLogger },
                    {
                      function_module_name: functionModuleName,
                      function_group_name: functionGroupName,
                      transport_request: transportRequest,
                    },
                  ),
              );

              if (!deleteFMResponse.isError) {
                testLogger?.info(
                  `🧹 Cleaned up test function module: ${functionModuleName}`,
                );
              } else {
                const errorMsg =
                  deleteFMResponse.content[0]?.text || 'Unknown error';
                testLogger?.error(
                  `⚠️  Failed to delete function module ${functionModuleName}: ${errorMsg}. Object left in SAP system.`,
                );
              }
            } catch (cleanupError: any) {
              testLogger?.error(
                `⚠️  Failed to cleanup function module ${functionModuleName}: ${cleanupError.message || cleanupError}. Object left in SAP system.`,
              );
            }

            // Unlock FUGR if still locked
            if (fgLockHandle && fgLockSession) {
              try {
                await invoke(
                  'UnlockFunctionGroupLow',
                  {
                    function_group_name: functionGroupName,
                    lock_handle: fgLockHandle,
                    session_id: fgLockSession.session_id!,
                    session_state: fgLockSession.session_state,
                  },
                  () =>
                    handleUnlockFunctionGroup(
                      { connection, logger: testLogger },
                      {
                        function_group_name: functionGroupName,
                        lock_handle: fgLockHandle!,
                        session_id: fgLockSession!.session_id!,
                        session_state: fgLockSession!.session_state,
                      },
                    ),
                );
              } catch (unlockError) {
                // Silent cleanup failure
              }
            }

            // Delete FUGR
            try {
              await delay(2000);
              const deleteFGResponse = await invoke(
                'DeleteFunctionGroupLow',
                {
                  function_group_name: functionGroupName,
                  transport_request: transportRequest,
                },
                () =>
                  handleDeleteFunctionGroup(
                    { connection, logger: testLogger },
                    {
                      function_group_name: functionGroupName,
                      transport_request: transportRequest,
                    },
                  ),
              );

              if (!deleteFGResponse.isError) {
                testLogger?.info(
                  `🧹 Cleaned up test function group: ${functionGroupName}`,
                );
              } else {
                const errorMsg =
                  deleteFGResponse.content[0]?.text || 'Unknown error';
                testLogger?.error(
                  `⚠️  Failed to delete function group ${functionGroupName}: ${errorMsg}. Object left in SAP system.`,
                );
              }
            } catch (cleanupError: any) {
              testLogger?.error(
                `⚠️  Failed to cleanup function group ${functionGroupName}: ${cleanupError.message || cleanupError}. Object left in SAP system.`,
              );
            }
          } else {
            testLogger?.info(
              `⚠️ Cleanup skipped (cleanup_after=false) - objects left for analysis`,
            );
          }

          diagnosticsTracker.cleanup();
        }
      },
      getTimeout('long'),
    );
  });
});
