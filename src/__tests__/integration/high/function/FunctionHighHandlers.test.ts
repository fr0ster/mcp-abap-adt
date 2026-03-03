/**
 * Integration tests for Function High-Level Handlers
 *
 * Tests all high-level handlers for Function module:
 * - CreateFunctionGroup (high-level) - handles validate, create, activate
 * - UpdateFunctionGroup (high-level) - handles lock, get current, update metadata, unlock
 * - CreateFunctionModule (high-level) - handles validate, create, lock, update, check, unlock, activate
 * - UpdateFunctionModule (high-level) - handles lock, update, check, unlock, activate
 *
 * Enable debug logs:
 *   DEBUG_TESTS=true         - Test execution logs
 *   DEBUG_HANDLERS=true     - Handler logs
 *   DEBUG_ADT_LIBS=true      - Library logs
 *   DEBUG_CONNECTORS=true    - Connection logs
 *
 * Run: npm test -- --testPathPattern=integration/function/
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleCreateFunctionGroup } from '../../../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../../../handlers/function/high/handleCreateFunctionModule';
import { handleUpdateFunctionGroup } from '../../../../handlers/function/high/handleUpdateFunctionGroup';
import { handleUpdateFunctionModule } from '../../../../handlers/function/high/handleUpdateFunctionModule';
import { handleDeleteFunctionGroup } from '../../../../handlers/function/low/handleDeleteFunctionGroup';
import { handleDeleteFunctionModule } from '../../../../handlers/function/low/handleDeleteFunctionModule';
import { handleGetSession } from '../../../../handlers/system/readonly/handleGetSession';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getTimeout,
  loadTestEnv,
  resolvePackageName,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  createTestConnectionAndSession,
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
  parseHandlerResponse,
} from '../../helpers/testHelpers';

// Load environment variables
// loadTestEnv will be called in beforeAll

const testLogger = createTestLogger('function-high');

describe('Function High-Level Handlers Integration', () => {
  let connection: AbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;
  let mcp: {
    client: any;
    toolNames: Set<string>;
    close: () => Promise<void>;
  } | null = null;

  beforeAll(async () => {
    try {
      if (isHardModeEnabled()) {
        mcp = await createHardModeClient();
        hasConfig = true;
        return;
      }
      // Create connection and session
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

  it(
    'should test all Function high-level handlers',
    async () => {
      if (!hasConfig || (!isHardModeEnabled() && (!connection || !session))) {
        testLogger?.info(
          '⏭️  Skipping test: No configuration, connection or session',
        );
        return;
      }

      // Get test case configuration (single config for both FUGR and FM)
      const testCase = getEnabledTestCase('create_function', 'full_workflow');

      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: No test case configuration');
        return;
      }

      const functionGroupName = testCase.params.function_group_name;
      const functionModuleName = testCase.params.function_module_name;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const functionGroupDescription =
        testCase.params.function_group_description ||
        `Test function group for high-level handler`;
      const functionModuleDescription =
        testCase.params.function_module_description ||
        `Test function module for high-level handler`;
      const updateFunctionGroupDescription =
        testCase.params.update_function_group_description;

      if (!testCase.params.update_source_code) {
        throw new Error(
          'update_source_code is required in test configuration for create_function',
        );
      }
      // Remove comment blocks from update source code as SAP doesn't allow them in function modules
      let updatedSourceCode = testCase.params.update_source_code;
      // Remove comment blocks (lines starting with *")
      updatedSourceCode = updatedSourceCode
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('*"'))
        .join('\n');

      try {
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
          try {
            return await callTool(mcp.client, mcp.toolNames, [toolName], args);
          } catch (error: any) {
            return {
              isError: true,
              content: [
                { type: 'text', text: error?.message || String(error) },
              ],
            };
          }
        };

        // Step 1: CreateFunctionGroup (High-Level)
        // High-level handler does validation internally, but we check the result
        testLogger?.info(
          `📦 High Create: Creating function group ${functionGroupName}...`,
        );
        testLogger?.info(
          `📦 High Create: Package: ${packageName}, Transport: ${transportRequest || '(empty)'}`,
        );
        const createFGResponse = await invoke(
          'CreateFunctionGroup',
          {
            function_group_name: functionGroupName,
            description: functionGroupDescription,
            package_name: packageName,
            transport_request: transportRequest,
            activate: true,
          },
          () =>
            handleCreateFunctionGroup(
              { connection, logger: testLogger },
              {
                function_group_name: functionGroupName,
                description: functionGroupDescription,
                package_name: packageName,
                transport_request: transportRequest,
                activate: true,
              },
            ),
        );

        if (createFGResponse.isError) {
          throw new Error(
            `CreateFunctionGroup failed: ${createFGResponse.content[0]?.text || 'Unknown error'}`,
          );
        }

        const createFGData = parseHandlerResponse(createFGResponse);
        testLogger?.info(
          `✅ High Create: Created function group ${functionGroupName} successfully`,
        );

        await delay(getOperationDelay('create', testCase));

        // Step 2: UpdateFunctionGroup (High-Level)
        if (updateFunctionGroupDescription) {
          testLogger?.info(
            `📝 High Update: Updating function group ${functionGroupName}...`,
          );
          const updateFGResponse = await invoke(
            'UpdateFunctionGroup',
            {
              function_group_name: functionGroupName,
              description: updateFunctionGroupDescription,
              transport_request: transportRequest,
            },
            () =>
              handleUpdateFunctionGroup(
                { connection, logger: testLogger },
                {
                  function_group_name: functionGroupName,
                  description: updateFunctionGroupDescription,
                  transport_request: transportRequest,
                },
              ),
          );

          if (updateFGResponse.isError) {
            throw new Error(
              `UpdateFunctionGroup failed: ${updateFGResponse.content[0]?.text || 'Unknown error'}`,
            );
          }

          const updateFGData = parseHandlerResponse(updateFGResponse);
          testLogger?.info(
            `✅ High Update: Updated function group ${functionGroupName} successfully`,
          );
          await delay(getOperationDelay('update', testCase));
        }

        // Step 3: CreateFunctionModule (High-Level) — creates in initial state
        testLogger?.info(
          `📦 High Create: Creating function module ${functionModuleName}...`,
        );
        const createFMResponse = await invoke(
          'CreateFunctionModule',
          {
            function_group_name: functionGroupName,
            function_module_name: functionModuleName,
            description: functionModuleDescription,
            transport_request: transportRequest,
          },
          () =>
            handleCreateFunctionModule(
              { connection, logger: testLogger },
              {
                function_group_name: functionGroupName,
                function_module_name: functionModuleName,
                description: functionModuleDescription,
                transport_request: transportRequest,
              },
            ),
        );

        if (createFMResponse.isError) {
          const errorMsg = createFMResponse.content[0]?.text || 'Unknown error';
          const errorLower = errorMsg.toLowerCase();
          // Skip test if authorization error (S_ABPLNGVS or similar)
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
          throw new Error(`CreateFunctionModule failed: ${errorMsg}`);
        }

        const createFMData = parseHandlerResponse(createFMResponse);
        testLogger?.info(
          `✅ High Create: Created function module ${functionModuleName} successfully`,
        );

        await delay(getOperationDelay('create', testCase));

        // Step 4: UpdateFunctionModule (High-Level)
        testLogger?.info(
          `📝 High Update: Updating function module ${functionModuleName}...`,
        );
        const updateFMResponse = await invoke(
          'UpdateFunctionModule',
          {
            function_group_name: functionGroupName,
            function_module_name: functionModuleName,
            source_code: updatedSourceCode,
            transport_request: transportRequest,
            activate: true,
          },
          () =>
            handleUpdateFunctionModule(
              { connection, logger: testLogger },
              {
                function_group_name: functionGroupName,
                function_module_name: functionModuleName,
                source_code: updatedSourceCode,
                transport_request: transportRequest,
                activate: true,
              },
            ),
        );

        if (updateFMResponse.isError) {
          throw new Error(
            `UpdateFunctionModule failed: ${updateFMResponse.content[0]?.text || 'Unknown error'}`,
          );
        }

        const updateFMData = parseHandlerResponse(updateFMResponse);
        testLogger?.info(
          `✅ High Update: Updated function module ${functionModuleName} successfully`,
        );

        await delay(getOperationDelay('update', testCase));
      } finally {
        // Cleanup: Optionally delete test function module first, then function group
        const shouldCleanup = getCleanupAfter(testCase);

        if (session && functionModuleName && functionGroupName) {
          try {
            // Delete function module only if cleanup_after is true
            if (shouldCleanup) {
              await delay(2000); // Ensure function module is ready for deletion
              const deleteFMResponse = await invoke(
                'DeleteFunctionModule',
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
                testLogger?.warn(
                  `⚠️  Failed to delete function module ${functionModuleName}: ${errorMsg}`,
                );
              }
            } else {
              testLogger?.info(
                `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${functionModuleName}`,
              );
            }
          } catch (cleanupError) {
            testLogger?.warn(
              `⚠️  Failed to cleanup test function module ${functionModuleName}: ${cleanupError}`,
            );
          }
        }

        if (session && functionGroupName) {
          try {
            // Delete function group only if cleanup_after is true
            if (shouldCleanup) {
              await delay(2000); // Ensure function group is ready for deletion
              const deleteFGResponse = await invoke(
                'DeleteFunctionGroup',
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
                testLogger?.warn(
                  `⚠️  Failed to delete function group ${functionGroupName}: ${errorMsg}`,
                );
              }
            } else {
              testLogger?.info(
                `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${functionGroupName}`,
              );
            }
          } catch (cleanupError) {
            testLogger?.warn(
              `⚠️  Failed to cleanup test function group ${functionGroupName}: ${cleanupError}`,
            );
          }
        }
      }
    },
    getTimeout('long'),
  );
});
