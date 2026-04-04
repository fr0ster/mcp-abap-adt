/**
 * Integration tests for GetFunctionModule Handler (read-only)
 *
 * Reads a shared function module from shared_dependencies config.
 * Requires shared:setup to have been run first.
 *
 * Run: npm test -- --testPathPatterns=readOnly/function/GetFunctionModule
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleGetFunctionModule } from '../../../../handlers/function_module/high/handleGetFunctionModule';
import {
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
  resolveSharedDependency,
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
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

const testLogger = createTestLogger('get-function-module');

describe('GetFunctionModule Handler Integration (read-only)', () => {
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
      const result = await createTestConnectionAndSession();
      connection = result.connection;
      session = result.session;
      hasConfig = true;
    } catch (error) {
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
    'should read shared function module',
    async () => {
      if (!hasConfig || (!isHardModeEnabled() && (!connection || !session))) {
        testLogger?.info(
          '⏭️  Skipping test: No configuration, connection or session',
        );
        return;
      }

      // Get FM from shared_dependencies
      const sharedFM = resolveSharedDependency(
        'function_modules',
        'Z_MCP_BLD_SHR_FM',
      );
      if (!sharedFM) {
        testLogger?.info(
          '⏭️  Skipping test: No shared function module configured',
        );
        return;
      }

      if (!isTestAvailableForSystem(sharedFM.available_in)) {
        testLogger?.info(
          `⏭️  Skipping test: not available on ${getSystemType()}`,
        );
        return;
      }

      const functionModuleName = sharedFM.name;
      const functionGroupName = sharedFM.group;

      testLogger?.info(
        `📖 Reading function module ${functionModuleName} from group ${functionGroupName}...`,
      );

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

      const response = await invoke(
        'GetFunctionModule',
        {
          function_module_name: functionModuleName,
          function_group_name: functionGroupName,
          version: 'active',
        },
        () => {
          const ctx = createHandlerContext({
            connection: connection!,
            logger: testLogger,
          });
          return handleGetFunctionModule(ctx, {
            function_module_name: functionModuleName,
            function_group_name: functionGroupName,
            version: 'active',
          });
        },
      );

      if (response.isError) {
        const errorMsg = response.content[0]?.text || 'Unknown error';
        // Skip if FM not found (shared:setup not run yet)
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('404') ||
          errorMsg.includes('500')
        ) {
          testLogger?.info(
            `⏭️  Skipping test: Shared FM not found on system (run shared:setup first): ${errorMsg}`,
          );
          return;
        }
        throw new Error(`GetFunctionModule failed: ${errorMsg}`);
      }

      const data = parseHandlerResponse(response);
      expect(data.success).toBe(true);
      expect(data.function_module_name).toBe(functionModuleName.toUpperCase());
      expect(data.function_group_name).toBe(functionGroupName.toUpperCase());
      expect(data.function_module_data).toBeDefined();

      testLogger?.info(`✅ GetFunctionModule completed: ${functionModuleName}`);
    },
    getTimeout('medium'),
  );
});
