/**
 * Integration tests for FunctionInclude read-only handlers
 *
 * - GetFunctionInclude          — reads the generated TOP include of the shared FUGR
 * - ListFunctionGroupIncludes    — lists the includes of the shared FUGR
 * - ListFunctionModules          — lists the function modules of the shared FUGR
 *
 * Reads the shared function group (ZMCP_SHR_FGRP) and its function module
 * (Z_MCP_SHR_FM). Requires shared:setup to have been run first.
 *
 * Config-driven: skips cleanly when no SAP connection / test case disabled /
 * wrong system type.
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/function/FunctionIncludeReadOnlyHandlers.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import { handleGetFunctionInclude } from '../../../../handlers/function_include/readonly/handleGetFunctionInclude';
import { handleListFunctionGroupIncludes } from '../../../../handlers/function_include/readonly/handleListFunctionGroupIncludes';
import { handleListFunctionModules } from '../../../../handlers/function_include/readonly/handleListFunctionModules';
import { getTestCase, testCaseKey } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { skipRunningTest } from '../../helpers/runningTest';
import { servedSuite } from '../../helpers/servedHere';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
import { headOf, terseOf, terseText } from '../../helpers/terseAnswer';
import { readCaseParams, type TestCase } from '../../helpers/testConfigSchema';
import {
  callTool,
  createHardModeClient,
  type HardModeClient,
  isHardModeEnabled,
} from '../../helpers/testers/hardMode';
import {
  createHandlerContext,
  handlerAnswer,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

/** What the include read's case states. */
const FunctionIncludeReadParams = z.looseObject({
  function_group_name: z.string(),
  include_name: z.string(),
});

/** What the list cases state: the group alone. */
const FunctionGroupListParams = z.looseObject({
  function_group_name: z.string(),
});

/** The include read's case parameters, read through FunctionIncludeReadParams. */
const includeParamsOf = (testCase: TestCase) =>
  readCaseParams(
    testCase.params,
    FunctionIncludeReadParams,
    'read_function_include_readonly',
  );

/** A list case's parameters, read through FunctionGroupListParams. */
const groupParamsOf = (testCase: TestCase, section: string) =>
  readCaseParams(testCase.params, FunctionGroupListParams, section);

const testLogger = createTestLogger('function-include-readonly');

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite([
  'GetFunctionInclude',
  'ListFunctionGroupIncludes',
  'ListFunctionModules',
]);

/**
 * A function group list's terse answer (the default) read back: its
 * `# function_group` and `# total` heads, then its rows, each `name` read
 * by the header's column name.
 */
function terseGroupList(response: { content: Array<{ text?: string }> }): {
  group: string;
  total: number;
  names: string[];
  text: string;
} {
  const answer = terseOf(terseText(response));
  assert.ok(answer.columns.includes('name'), answer.text);
  return {
    group: headOf(answer, 'function_group') ?? '',
    total: Number(headOf(answer, 'total') ?? Number.NaN),
    names: answer.rows.map((row) => (row.name ?? '').toUpperCase()),
    text: answer.text,
  };
}

describe('FunctionInclude ReadOnly Handlers Integration', () => {
  let connection: IAbapConnection | null = null;
  let session: SessionInfo | null = null;
  let hasConfig = false;
  let mcp: HardModeClient | null = null;

  before(async () => {
    try {
      if (isHardModeEnabled()) {
        mcp = await createHardModeClient('full');
        hasConfig = true;
        return;
      }
      const result = await createTestConnectionAndSession();
      connection = result.connection;
      session = result.session;
      hasConfig = true;
    } catch (_error) {
      testLogger?.warn(
        '⚠️ No .env file or SAP configuration found: each case skips',
      );
      hasConfig = false;
    }
  });

  after(async () => {
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
      return await callTool(mcp, [toolName], args);
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

  it('should read the TOP include of the shared function group', async () => {
    const reason = skipReason();
    if (reason) {
      skipRunningTest(`${reason}`);
      return;
    }

    const testCase = getTestCase(
      'read_function_include_readonly',
      'read_top_include',
    );
    if (!testCase) {
      skipRunningTest(
        `the test config has no ${testCaseKey('read_function_include_readonly', 'read_top_include')}`,
      );
      return;
    }

    const {
      function_group_name: functionGroupName,
      include_name: includeName,
    } = includeParamsOf(testCase);

    testLogger?.info(
      `📖 Reading include ${includeName} of group ${functionGroupName}...`,
    );

    const response = await invoke(
      'GetFunctionInclude',
      {
        function_group_name: functionGroupName,
        include_name: includeName,
        version: 'active',
      },
      () =>
        handleGetFunctionInclude(
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
        skipRunningTest(
          `Shared FUGR/include not found (run shared:setup first): ${errorMsg}`,
        );
        return;
      }
      throw new Error(`GetFunctionInclude failed: ${errorMsg}`);
    }

    const data = handlerAnswer(
      response,
      z.looseObject({
        function_group_name: z.unknown(),
        include_name: z.unknown(),
        success: z.unknown(),
      }),
    );
    assert.equal(data.success, true);
    assert.equal(data.function_group_name, functionGroupName.toUpperCase());
    assert.equal(data.include_name, includeName.toUpperCase());

    testLogger?.info(`✅ GetFunctionInclude completed: ${includeName}`);
  });

  it('should list the includes of the shared function group', async () => {
    const reason = skipReason();
    if (reason) {
      skipRunningTest(`${reason}`);
      return;
    }

    const testCase = getTestCase(
      'list_function_group_includes_readonly',
      'list_includes',
    );
    if (!testCase) {
      skipRunningTest(
        `the test config has no ${testCaseKey('list_function_group_includes_readonly', 'list_includes')}`,
      );
      return;
    }

    const functionGroupName = groupParamsOf(
      testCase,
      'list_function_group_includes_readonly',
    ).function_group_name;

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
        skipRunningTest(
          `Shared FUGR not found (run shared:setup first): ${errorMsg}`,
        );
        return;
      }
      throw new Error(`ListFunctionGroupIncludes failed: ${errorMsg}`);
    }

    const data = terseGroupList(response);
    assert.equal(
      data.group.toUpperCase(),
      functionGroupName.toUpperCase(),
      data.text,
    );
    assert.equal(data.total, data.names.length, data.text);

    const includeNames = data.names;
    const topInclude = `L${functionGroupName.toUpperCase()}TOP`;

    // The TOP include must be present. ListFunctionGroupIncludes returns ALL
    // FUGR/I includes faithfully (including the generated L<FUGR>UXX collector);
    // filtering the collector is a backup-tool concern, not this read tool's.
    assert.ok(includeNames.includes(topInclude), data.text);

    testLogger?.info(
      `✅ ListFunctionGroupIncludes completed: ${data.total} include(s)`,
    );
  });

  it('should list the function modules of the shared function group', async () => {
    const reason = skipReason();
    if (reason) {
      skipRunningTest(`${reason}`);
      return;
    }

    const testCase = getTestCase(
      'list_function_modules_readonly',
      'list_modules',
    );
    if (!testCase) {
      skipRunningTest(
        `the test config has no ${testCaseKey('list_function_modules_readonly', 'list_modules')}`,
      );
      return;
    }

    const functionGroupName = groupParamsOf(
      testCase,
      'list_function_modules_readonly',
    ).function_group_name;
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
        skipRunningTest(
          `Shared FUGR not found (run shared:setup first): ${errorMsg}`,
        );
        return;
      }
      throw new Error(`ListFunctionModules failed: ${errorMsg}`);
    }

    const data = terseGroupList(response);
    assert.equal(
      data.group.toUpperCase(),
      functionGroupName.toUpperCase(),
      data.text,
    );
    assert.equal(data.total, data.names.length, data.text);

    const moduleNames = data.names;
    assert.ok(moduleNames.includes(expectedFm.toUpperCase()), data.text);

    testLogger?.info(
      `✅ ListFunctionModules completed: ${data.total} module(s)`,
    );
  });
});
