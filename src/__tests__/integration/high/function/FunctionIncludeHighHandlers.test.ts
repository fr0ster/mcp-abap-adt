/**
 * Integration tests for FunctionInclude high-level handlers
 *
 * Lifecycle:
 *   CreateFunctionInclude (custom letter-suffix include)
 *   -> UpdateFunctionInclude (set source)
 *   -> ReadFunctionInclude   (verify source round-trips)
 *   -> DeleteFunctionInclude (cleanup)
 *
 * Uses a LETTER-suffix include name (NOT numeric) inside the shared FUGR
 * (ZMCP_SHR_FGRP) so the ADT backend allows deletion.
 *
 * Config-driven: skips cleanly when no SAP connection / test case disabled /
 * wrong system type.
 *
 * Run: npm test -- --testPathPatterns=high/function/FunctionIncludeHigh
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleCreateFunctionInclude } from '../../../../handlers/function_include/high/handleCreateFunctionInclude';
import { handleDeleteFunctionInclude } from '../../../../handlers/function_include/high/handleDeleteFunctionInclude';
import { handleUpdateFunctionInclude } from '../../../../handlers/function_include/high/handleUpdateFunctionInclude';
import { handleReadFunctionInclude } from '../../../../handlers/function_include/readonly/handleReadFunctionInclude';
import {
  getCleanupAfter,
  getEnabledTestCase,
  getOperationDelay,
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
  resolveTransportRequest,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
import {
  callTool,
  createHardModeClient,
  isHardModeEnabled,
} from '../../helpers/testers/hardMode';
import { delay, parseHandlerResponse } from '../../helpers/testHelpers';

const testLogger = createTestLogger('function-include-high');

describe('FunctionInclude High-Level Handlers Integration', () => {
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
      const { connection: testConnection, session: testSession } =
        await createTestConnectionAndSession();
      connection = testConnection;
      session = testSession;
      hasConfig = true;
    } catch (_error) {
      testLogger?.warn(
        '⚠️ Skipping tests: No .env file or SAP configuration found',
      );
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
    'should run the FunctionInclude create/update/read/delete lifecycle',
    async () => {
      if (!hasConfig || (!isHardModeEnabled() && (!connection || !session))) {
        testLogger?.info(
          '⏭️  Skipping test: No configuration, connection or session',
        );
        return;
      }

      const testCase = getEnabledTestCase(
        'function_include_high',
        'full_workflow_high',
      );
      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: No test case configuration');
        return;
      }
      if (!isTestAvailableForSystem(testCase.available_in)) {
        testLogger?.info(
          `⏭️  Skipping test: not available on ${getSystemType()} (available_in: ${testCase.available_in?.join(', ')})`,
        );
        return;
      }

      const functionGroupName = testCase.params.function_group_name;
      const includeName = testCase.params.include_name;
      const description =
        testCase.params.description || 'Custom include for lifecycle test';
      const transportRequest = resolveTransportRequest(testCase);

      if (!testCase.params.update_source_code) {
        throw new Error(
          'update_source_code is required in test configuration for function_include_high',
        );
      }
      const updatedSourceCode: string = testCase.params.update_source_code;

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
            content: [{ type: 'text', text: error?.message || String(error) }],
          };
        }
      };

      let created = false;

      try {
        // Step 1: CreateFunctionInclude
        testLogger?.info(
          `📦 High Create: Creating include ${includeName} in ${functionGroupName} (transport: ${transportRequest || '(local)'})...`,
        );
        const createResponse = await invoke(
          'CreateFunctionInclude',
          {
            function_group_name: functionGroupName,
            include_name: includeName,
            description,
            transport_request: transportRequest,
          },
          () =>
            handleCreateFunctionInclude(
              { connection: connection!, logger: testLogger },
              {
                function_group_name: functionGroupName,
                include_name: includeName,
                description,
                transport_request: transportRequest,
              },
            ),
        );

        if (createResponse.isError) {
          const errorMsg = createResponse.content[0]?.text || 'Unknown error';
          const errorLower = errorMsg.toLowerCase();
          if (
            errorLower.includes('not authorized') ||
            errorLower.includes('authorization')
          ) {
            testLogger?.warn(
              `⚠️  Skipping test: No authorization to create function include: ${errorMsg}`,
            );
            return;
          }
          if (errorLower.includes('not found') || errorMsg.includes('404')) {
            testLogger?.info(
              `⏭️  Skipping test: Shared function group not found (run shared:setup first): ${errorMsg}`,
            );
            return;
          }
          throw new Error(`CreateFunctionInclude failed: ${errorMsg}`);
        }

        created = true;
        const createData = parseHandlerResponse(createResponse);
        expect(createData.success).toBe(true);
        testLogger?.info(`✅ High Create: Created include ${includeName}`);

        await delay(getOperationDelay('create', testCase));

        // Step 2: UpdateFunctionInclude
        testLogger?.info(`📝 High Update: Updating include ${includeName}...`);
        const updateResponse = await invoke(
          'UpdateFunctionInclude',
          {
            function_group_name: functionGroupName,
            include_name: includeName,
            source_code: updatedSourceCode,
            transport_request: transportRequest,
            activate: true,
          },
          () =>
            handleUpdateFunctionInclude(
              { connection: connection!, logger: testLogger },
              {
                function_group_name: functionGroupName,
                include_name: includeName,
                source_code: updatedSourceCode,
                transport_request: transportRequest,
                activate: true,
              },
            ),
        );

        if (updateResponse.isError) {
          throw new Error(
            `UpdateFunctionInclude failed: ${updateResponse.content[0]?.text || 'Unknown error'}`,
          );
        }
        const updateData = parseHandlerResponse(updateResponse);
        expect(updateData.success).toBe(true);
        testLogger?.info(`✅ High Update: Updated include ${includeName}`);

        await delay(getOperationDelay('update', testCase));

        // Step 3: ReadFunctionInclude — verify source round-trips
        testLogger?.info(`📖 Read-back: Reading include ${includeName}...`);
        const readResponse = await invoke(
          'ReadFunctionInclude',
          {
            function_group_name: functionGroupName,
            include_name: includeName,
            version: 'active',
          },
          () =>
            handleReadFunctionInclude(
              { connection: connection!, logger: testLogger },
              {
                function_group_name: functionGroupName,
                include_name: includeName,
                version: 'active',
              },
            ),
        );

        if (readResponse.isError) {
          throw new Error(
            `ReadFunctionInclude failed: ${readResponse.content[0]?.text || 'Unknown error'}`,
          );
        }
        const readData = parseHandlerResponse(readResponse);
        expect(readData.success).toBe(true);
        expect(readData.include_name).toBe(includeName.toUpperCase());
        // Source should round-trip: assert a stable token from the snippet survives.
        if (readData.source_code) {
          expect(String(readData.source_code)).toContain(
            'function-include-roundtrip',
          );
        }
        testLogger?.info(`✅ Read-back: Verified include ${includeName}`);
      } finally {
        // Step 4: DeleteFunctionInclude (cleanup)
        const shouldCleanup = getCleanupAfter(testCase);
        if (created && shouldCleanup) {
          try {
            await delay(2000);
            const deleteResponse = await invoke(
              'DeleteFunctionInclude',
              {
                function_group_name: functionGroupName,
                include_name: includeName,
                transport_request: transportRequest,
              },
              () =>
                handleDeleteFunctionInclude(
                  { connection: connection!, logger: testLogger },
                  {
                    function_group_name: functionGroupName,
                    include_name: includeName,
                    transport_request: transportRequest,
                  },
                ),
            );

            if (!deleteResponse.isError) {
              testLogger?.info(
                `🧹 Cleaned up test function include: ${includeName}`,
              );
            } else {
              testLogger?.warn(
                `⚠️  Failed to delete function include ${includeName}: ${deleteResponse.content[0]?.text || 'Unknown error'}`,
              );
            }
          } catch (cleanupError) {
            testLogger?.warn(
              `⚠️  Failed to cleanup function include ${includeName}: ${cleanupError}`,
            );
          }
        } else if (created) {
          testLogger?.info(
            `⚠️ Cleanup skipped (cleanup_after=false) - object left for analysis: ${includeName}`,
          );
        }
      }
    },
    getTimeout('long'),
  );
});
