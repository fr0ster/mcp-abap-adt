/**
 * Integration test for the GetStructuresList read-only handler.
 *
 * - GetStructuresList — recursively lists the structures embedded in an ABAP
 *   structure (.INCLUDE / append) as a tree.
 *
 * Reads the shared base structure (ZMCP_SHR_STRU) which contains
 * `include ZMCP_SHR_STRU_INC;`. Asserts that the returned tree has a child whose
 * `structure` equals the expected include with `kind === 'include'`.
 *
 * Structure names come from the config case params (`structure_name` root,
 * `expected_include` child) — they are not hardcoded in this file.
 *
 * Config-driven: skips cleanly when no SAP connection / test case disabled /
 * wrong system type / structure not found.
 *
 * Run: npm test -- --testPathPatterns=readOnly/structure/GetStructuresListHandler
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { handleGetStructuresList } from '../../../../handlers/structure/readonly/handleGetStructuresList';
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

const testLogger = createTestLogger('structure-list-readonly');

interface StructureNode {
  structure: string;
  kind: 'root' | 'include' | 'append';
  children: StructureNode[];
  cyclic?: boolean;
  error?: string;
}

describe('GetStructuresList ReadOnly Handler Integration', () => {
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
    'should recursively list the structures embedded in the base structure',
    async () => {
      const reason = skipReason();
      if (reason) {
        testLogger?.info(`⏭️  Skipping test: ${reason}`);
        return;
      }

      const testCase = getEnabledTestCase(
        'get_structures_list_readonly',
        'list_embedded_structures',
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

      const structureName = testCase.params.structure_name;
      const expectedInclude = String(
        testCase.params.expected_include,
      ).toUpperCase();

      testLogger?.info(`📋 Listing structures embedded in ${structureName}...`);

      const response = await invoke(
        'GetStructuresList',
        { structure_name: structureName, version: 'active' },
        () =>
          handleGetStructuresList(
            createHandlerContext({
              connection: connection!,
              logger: testLogger,
            }),
            { structure_name: structureName, version: 'active' },
          ),
      );

      if (response.isError) {
        const errorMsg = response.content[0]?.text || 'Unknown error';
        if (
          errorMsg.includes('not found') ||
          errorMsg.includes('Could not read') ||
          errorMsg.includes('404') ||
          errorMsg.includes('500')
        ) {
          testLogger?.info(
            `⏭️  Skipping test: Shared structure not found: ${errorMsg}`,
          );
          return;
        }
        throw new Error(`GetStructuresList failed: ${errorMsg}`);
      }

      const data = parseHandlerResponse(response);
      expect(data.success).toBe(true);

      const tree = data.tree as StructureNode;
      expect(tree).toBeDefined();
      expect(tree.kind).toBe('root');
      expect(tree.structure).toBe(structureName.toUpperCase());

      const child = (tree.children ?? []).find(
        (node) => node.structure === expectedInclude,
      );
      expect(child).toBeDefined();
      expect(child?.kind).toBe('include');

      testLogger?.info(
        `✅ GetStructuresList completed: found include ${expectedInclude}`,
      );
    },
    getTimeout('medium'),
  );
});
