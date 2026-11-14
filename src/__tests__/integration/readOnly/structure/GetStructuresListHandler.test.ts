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

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import { handleGetStructuresList } from '../../../../handlers/structure/readonly/handleGetStructuresList';
import {
  getEnabledTestCase,
  isTestAvailableForSystem,
  statedKindWords,
} from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { skipRunningTest } from '../../helpers/runningTest';
import {
  createTestConnectionAndSession,
  type SessionInfo,
} from '../../helpers/sessionHelpers';
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

/** What this file's cases state, as its tests read them. */
const StructuresListParams = z.looseObject({
  expected_append: z.string().optional(),
  expected_include: z.string().optional(),
  structure_name: z.string(),
});

/** A case's parameters, read through StructuresListParams. */
const paramsOf = (testCase: TestCase) =>
  readCaseParams(
    testCase.params,
    StructuresListParams,
    'get_structures_list_readonly',
  );

const testLogger = createTestLogger('structure-list-readonly');

interface StructureNode {
  structure: string;
  kind: 'root' | 'include' | 'append';
  children: StructureNode[];
  cyclic?: boolean;
  error?: string;
}

describe('GetStructuresList ReadOnly Handler Integration', () => {
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

  it('should recursively list the structures embedded in the base structure', async () => {
    const reason = skipReason();
    if (reason) {
      skipRunningTest(`${reason}`);
      return;
    }

    const testCase = getEnabledTestCase(
      'get_structures_list_readonly',
      'list_embedded_structures',
    );
    if (!testCase) {
      skipRunningTest('No test case configuration');
      return;
    }
    if (!isTestAvailableForSystem(testCase.available_in)) {
      skipRunningTest(`not available on ${statedKindWords()}`);
      return;
    }

    const structureName = paramsOf(testCase).structure_name;
    const expectedInclude = String(
      paramsOf(testCase).expected_include,
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
        skipRunningTest(`Shared structure not found: ${errorMsg}`);
        return;
      }
      throw new Error(`GetStructuresList failed: ${errorMsg}`);
    }

    const data = handlerAnswer(
      response,
      z.looseObject({ success: z.unknown(), tree: z.unknown() }),
    );
    assert.equal(data.success, true);

    const tree = data.tree as StructureNode;
    assert.ok(tree !== undefined);
    assert.equal(tree.kind, 'root');
    assert.equal(tree.structure, structureName.toUpperCase());

    const child = (tree.children ?? []).find(
      (node) => node.structure === expectedInclude,
    );
    assert.ok(child !== undefined);
    assert.equal(child?.kind, 'include');

    // Append (extension) child — config-driven; only asserted when the test
    // case provides `expected_append` (the extension is created out-of-band,
    // since adt-clients cannot create `extend type` objects).
    //
    // **Out-of-band means it may not be here.** The config names an
    // extension somebody created by hand on one system, and nothing in
    // this repository creates it on another — on trial, `ZOK_S_APPEND`
    // answers 404 and SAP reports zero where-used references for the base
    // structure, scoped or unscoped (measured 2026-09-16 by a one-off script,
    // `scripts/probe-migration-failures.ts`, since removed in #234). Asserting the child anyway
    // turned a missing test fixture into a failure that reads like a
    // defect in the walk. So: when the named extension is absent from the
    // tree, say which of the two it is — an extension that is not on this
    // system, or a walk that lost one it should have found — by asking
    // whether the tool can see the object at all.
    const expectedAppend = paramsOf(testCase).expected_append
      ? String(paramsOf(testCase).expected_append).toUpperCase()
      : null;
    if (expectedAppend) {
      const appendChild = (tree.children ?? []).find(
        (node) => node.structure === expectedAppend,
      );
      if (!appendChild) {
        const probe = await handleGetStructuresList(
          createHandlerContext({
            connection: connection!,
            logger: testLogger,
          }),
          { structure_name: expectedAppend },
        );
        if (probe.isError) {
          skipRunningTest(
            `the append assertion: ${expectedAppend} does not exist on this system — ${probe.content[0]?.text?.slice(0, 200)}`,
          );
          return;
        }
      }
      assert.ok(appendChild !== undefined);
      assert.equal(appendChild?.kind, 'append');
    }

    testLogger?.info(
      `✅ GetStructuresList completed: found include ${expectedInclude}${
        expectedAppend ? ` + append ${expectedAppend}` : ''
      }`,
    );
  });
});
