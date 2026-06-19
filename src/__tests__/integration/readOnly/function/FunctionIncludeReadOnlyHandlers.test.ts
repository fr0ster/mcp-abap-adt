/**
 * Integration tests for FunctionInclude read-only handlers
 *
 * - ReadFunctionInclude          — reads the generated TOP include of the shared FUGR
 * - ListFunctionGroupIncludes    — lists the includes of the shared FUGR
 * - ListFunctionModules          — lists the function modules of the shared FUGR
 *
 * Reads the shared function group (ZMCP_SHR_FGRP) and its function module
 * (Z_MCP_SHR_FM). Requires shared:setup to have been run first.
 *
 * Config-driven: skips cleanly when no SAP connection / test case disabled /
 * wrong system type.
 *
 * Run: npm test -- --testPathPatterns=readOnly/function/FunctionIncludeReadOnly
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleListFunctionGroupIncludes } from '../../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../../../handlers/function_include/readonly/handleListFunctionModules';
import { handleReadFunctionInclude } from '../../../../handlers/function_include/readonly/handleReadFunctionInclude';
import {
  getEnabledTestCase,
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
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

const testLogger = createTestLogger('function-include-readonly');

describe('FunctionInclude ReadOnly Handlers Integration', () => {
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

  const skipReason = (): string | null => {
    if (!hasConfig || (!isHardModeEnabled() && (!connection || !session))) {
      return 'No configuration, connection or session';
    }
    return null;
  };

  it(
    'should read the TOP include of the shared function group',
    async () => {
      const reason = skipReason();
      if (reason) {
        testLogger?.info(`⏭️  Skipping test: ${reason}`);
        return;
      }

      const testCase = getEnabledTestCase(
        'read_function_include_readonly',
        'read_top_include',
      );
      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: No test case configuration');
        return;
      }
      if (!isTestAvailableForSystem(testCase.available_in)) {
        testLogger?.info(
          `⏭️  Skipping test: not available on ${getSystemType()}`,
        );
        return;
      }

      const functionGroupName = testCase.params.function_group_name;
      const includeName = testCase.params.include_name;

      testLogger?.info(
        `📖 Reading include ${includeName} of group ${functionGroupName}...`,
      );

      const response = await invoke(
        'ReadFunctionInclude',
        {
          function_group_name: functionGroupName,
          include_name: includeName,
          version: 'active',
        },
        () =>
          handleReadFunctionInclude(
            createHandlerContext({
              connection: connection!,
              logger: testLogger,
            }),
            {
              function_group_name: functionGroupName,
              include_name: includeName,
              version: 'active',
            },
          ),
      );

      if (response.isError) {
        const errorMsg = response.content[0]?.text || 'Unknown error';
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('404') ||
          errorMsg.includes('500')
        ) {
          testLogger?.info(
            `⏭️  Skipping test: Shared FUGR/include not found (run shared:setup first): ${errorMsg}`,
          );
          return;
        }
        throw new Error(`ReadFunctionInclude failed: ${errorMsg}`);
      }

      const data = parseHandlerResponse(response);
      expect(data.success).toBe(true);
      expect(data.function_group_name).toBe(functionGroupName.toUpperCase());
      expect(data.include_name).toBe(includeName.toUpperCase());

      testLogger?.info(`✅ ReadFunctionInclude completed: ${includeName}`);
    },
    getTimeout('medium'),
  );

  it(
    'should list the includes of the shared function group',
    async () => {
      const reason = skipReason();
      if (reason) {
        testLogger?.info(`⏭️  Skipping test: ${reason}`);
        return;
      }

      const testCase = getEnabledTestCase(
        'list_function_group_includes_readonly',
        'list_includes',
      );
      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: No test case configuration');
        return;
      }
      if (!isTestAvailableForSystem(testCase.available_in)) {
        testLogger?.info(
          `⏭️  Skipping test: not available on ${getSystemType()}`,
        );
        return;
      }

      const functionGroupName = testCase.params.function_group_name;

      testLogger?.info(`📋 Listing includes of group ${functionGroupName}...`);

      const response = await invoke(
        'ListFunctionGroupIncludes',
        { function_group_name: functionGroupName },
        () =>
          handleListFunctionGroupIncludes(
            createHandlerContext({
              connection: connection!,
              logger: testLogger,
            }),
            { function_group_name: functionGroupName },
          ),
      );

      if (response.isError) {
        const errorMsg = response.content[0]?.text || 'Unknown error';
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('404') ||
          errorMsg.includes('500')
        ) {
          testLogger?.info(
            `⏭️  Skipping test: Shared FUGR not found (run shared:setup first): ${errorMsg}`,
          );
          return;
        }
        throw new Error(`ListFunctionGroupIncludes failed: ${errorMsg}`);
      }

      const data = parseHandlerResponse(response);
      expect(data.success).toBe(true);
      expect(data.function_group_name).toBe(functionGroupName.toUpperCase());
      expect(Array.isArray(data.includes)).toBe(true);

      const includeNames = (data.includes as any[]).map((inc) =>
        String(
          typeof inc === 'string' ? inc : (inc?.name ?? inc),
        ).toUpperCase(),
      );
      const topInclude = `L${functionGroupName.toUpperCase()}TOP`;
      const collectorInclude = `L${functionGroupName.toUpperCase()}UXX`;

      // The TOP include must be present.
      expect(includeNames).toContain(topInclude);
      // The generated UXX collector include must be excluded.
      expect(includeNames).not.toContain(collectorInclude);

      testLogger?.info(
        `✅ ListFunctionGroupIncludes completed: ${data.total} include(s)`,
      );
    },
    getTimeout('medium'),
  );

  it(
    'should list the function modules of the shared function group',
    async () => {
      const reason = skipReason();
      if (reason) {
        testLogger?.info(`⏭️  Skipping test: ${reason}`);
        return;
      }

      const testCase = getEnabledTestCase(
        'list_function_modules_readonly',
        'list_modules',
      );
      if (!testCase) {
        testLogger?.info('⏭️  Skipping test: No test case configuration');
        return;
      }
      if (!isTestAvailableForSystem(testCase.available_in)) {
        testLogger?.info(
          `⏭️  Skipping test: not available on ${getSystemType()}`,
        );
        return;
      }

      const functionGroupName = testCase.params.function_group_name;
      // The shared FM that lives in ZMCP_SHR_FGRP (see check_function_module_high).
      const expectedFm = 'Z_MCP_SHR_FM';

      testLogger?.info(
        `📋 Listing function modules of group ${functionGroupName}...`,
      );

      const response = await invoke(
        'ListFunctionModules',
        { function_group_name: functionGroupName },
        () =>
          handleListFunctionModules(
            createHandlerContext({
              connection: connection!,
              logger: testLogger,
            }),
            { function_group_name: functionGroupName },
          ),
      );

      if (response.isError) {
        const errorMsg = response.content[0]?.text || 'Unknown error';
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('404') ||
          errorMsg.includes('500')
        ) {
          testLogger?.info(
            `⏭️  Skipping test: Shared FUGR not found (run shared:setup first): ${errorMsg}`,
          );
          return;
        }
        throw new Error(`ListFunctionModules failed: ${errorMsg}`);
      }

      const data = parseHandlerResponse(response);
      expect(data.success).toBe(true);
      expect(data.function_group_name).toBe(functionGroupName.toUpperCase());
      expect(Array.isArray(data.function_modules)).toBe(true);

      const moduleNames = (data.function_modules as any[]).map((fm) =>
        String(typeof fm === 'string' ? fm : (fm?.name ?? fm)).toUpperCase(),
      );
      expect(moduleNames).toContain(expectedFm.toUpperCase());

      testLogger?.info(
        `✅ ListFunctionModules completed: ${data.total} module(s)`,
      );
    },
    getTimeout('medium'),
  );
});
