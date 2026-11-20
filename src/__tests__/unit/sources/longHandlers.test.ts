/**
 * The approved list of long tools: `tools/long-handlers.json` names every
 * tool the user approved, tool by tool, with its handler and what it sends.
 * Every tool on it declares `background` (default true) and carries the
 * long-tool words in its description; no tool off it does either, but the
 * code-running tools' own `background` — whichever group registers it,
 * full or compact. No tool declares `timeout` (24.0.0). The server's own
 * list (`LONG_TOOLS`, what the wrapper reads) is the JSON's. Every listed
 * tool is a read, on an ABAP session of its own.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as z from 'zod';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
} from '../../../../compact-readonly-entries/src/group';
import { isBackgroundTool } from '../../../lib/backgroundRuns/tools';
import { compactDebugEntries } from '../../../lib/compact/debug/group';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { DataHandlersGroup } from '../../../lib/handlers/groups/DataHandlersGroup';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HighLevelHandlersGroup } from '../../../lib/handlers/groups/HighLevelHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { RuntimeRunHandlersGroup } from '../../../lib/handlers/groups/RuntimeRunHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type {
  HandlerContext,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { LONG_TOOL_ADVICE, LONG_TOOLS } from '../../../lib/longTools';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);

interface Listed {
  tool: string;
  set: 'full' | 'compact';
  handler: string;
  sends: string;
}

const listed = (): Listed[] =>
  JSON.parse(
    fs.readFileSync(path.join(REPO, 'tools/long-handlers.json'), 'utf8'),
  ) as Listed[];

/**
 * Every tool definition the groups declare, as a server holding background
 * runs lists them: full and compact. (The exporter hands its long tools out
 * without `background`: it keeps no background runs.)
 */
function groupDefinitions(): ToolDefinition[] {
  return [
    new ReadOnlyHandlersGroup(noConnectionContext()),
    new HighLevelHandlersGroup(noConnectionContext()),
    new SystemHandlersGroup(noConnectionContext()),
    new DataHandlersGroup(noConnectionContext()),
    new SearchHandlersGroup(noConnectionContext()),
    new RuntimeRunHandlersGroup(noConnectionContext()),
    new BackgroundRunHandlersGroup(noConnectionContext()),
    new DebugHandlersGroup(noConnectionContext()),
  ]
    .flatMap((group) => group.getHandlers().map((e) => e.toolDefinition))
    .concat(
      new CompactReadOnlyHandlersGroup(noConnectionContext())
        .getHandlers()
        .map((e) => e.toolDefinition),
      new CompactDataHandlersGroup(noConnectionContext())
        .getHandlers()
        .map((e) => e.toolDefinition),
      new CompactModifyHandlersGroup(noConnectionContext())
        .getHandlers()
        .map((e) => e.toolDefinition),
      compactDebugEntries().map((e) => e.toolDefinition),
    );
}

/** Every tool definition the packages ship: full groups, low included, and compact. */
function shippedDefinitions(): ToolDefinition[] {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  return [
    ...new HandlerExporter({
      systemType: 'onprem',
      includeReadOnly: true,
      includeHighLevel: true,
      includeSystem: true,
      includeSearch: true,
    })
      .getHandlerEntries()
      .map((e) => e.toolDefinition),
    // What the exporter leaves out (no store, no debugger, the data tools
    // unless asked for): the groups' own.
    ...[
      new DataHandlersGroup(noConnectionContext()),
      new RuntimeRunHandlersGroup(noConnectionContext()),
      new BackgroundRunHandlersGroup(noConnectionContext()),
      new DebugHandlersGroup(noConnectionContext()),
    ].flatMap((group) => group.getHandlers().map((e) => e.toolDefinition)),
    ...new CompactReadOnlyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...new CompactDataHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...new CompactModifyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...compactDebugEntries().map((e) => e.toolDefinition),
  ];
}

/** Whether a schema declares `timeout`. */
function declaresTimeout(definition: ToolDefinition): boolean {
  return Object.hasOwn(definition.inputSchema.shape, 'timeout');
}

/** Whether a schema declares `background`. */
function declaresBackground(definition: ToolDefinition): boolean {
  return Object.hasOwn(definition.inputSchema.shape, 'background');
}

const carriesAdvice = (definition: ToolDefinition) =>
  definition.description.includes(LONG_TOOL_ADVICE);

describe('the approved list of long tools', () => {
  const definitions = shippedDefinitions();
  const names = new Set(listed().map((l) => l.tool));

  it('sees every shipped tool, so the checks below are not vacuous', () => {
    // 19.0.0: the low set's 112 tools left the surface.
    assert.ok(definitions.length > 250);
  });

  it("the server's list is the JSON's, each tool once", () => {
    const tools = listed().map((l) => l.tool);
    assert.equal(new Set(tools).size, tools.length);
    assert.deepStrictEqual([...tools].sort(), [...LONG_TOOLS].sort());
  });

  it('the tools that start a run or run code are off the list, take no timeout and carry no long-tool words', () => {
    // Removed by the owner (2026-10-13): their work goes on in SAP, so a
    // timeout could only end the wait, never the work.
    const notReads = [
      'RunUnitTest',
      'RunCdsUnitTest',
      'RunProgramUnitTest',
      'RunFunctionGroupUnitTest',
      'RunFunctionModuleUnitTest',
      'RunATC',
      'GetUnitTestResult',
      'HandlerUnitTestResult',
      'HandlerCdsUnitTestResult',
      'RuntimeRunClass',
      'RuntimeRunProgram',
      'HandlerProfileRun',
    ];
    for (const tool of notReads) {
      assert.deepStrictEqual(
        { tool, listed: names.has(tool) },
        {
          tool,
          listed: false,
        },
      );
      const found = definitions.filter((d) => d.name === tool);
      assert.deepStrictEqual(
        { tool, shipped: found.length > 0 },
        {
          tool,
          shipped: true,
        },
      );
      for (const definition of found) {
        assert.deepStrictEqual(
          {
            tool,
            timeout: declaresTimeout(definition),
            advice: carriesAdvice(definition),
          },
          { tool, timeout: false, advice: false },
        );
      }
    }
  });

  it('no long tool declares timeout', () => {
    const offending = definitions
      .filter((d) => names.has(d.name))
      .filter(declaresTimeout)
      .map((d) => d.name);
    assert.deepStrictEqual(offending, []);
  });

  it('SearchSource is listed and still declares neither time_budget_ms nor timeout', () => {
    assert.equal(names.has('SearchSource'), true);
    const found = groupDefinitions().filter((d) => d.name === 'SearchSource');
    assert.ok(found.length > 0);
    for (const definition of found) {
      const shape = definition.inputSchema.shape;
      assert.deepStrictEqual(
        {
          time_budget_ms: Object.hasOwn(shape, 'time_budget_ms'),
          timeout: Object.hasOwn(shape, 'timeout'),
          background: Object.hasOwn(shape, 'background'),
        },
        { time_budget_ms: false, timeout: false, background: true },
      );
    }
  });

  it('every listed entry names its set, a handler that exists and what it sends', () => {
    for (const entry of listed()) {
      assert.ok(['full', 'compact'].includes(entry.set));
      assert.notEqual(entry.sends.trim(), '');
      const [file, fn] = entry.handler.split('#');
      const source = fs.readFileSync(path.join(REPO, file ?? ''), 'utf8');
      assert.deepStrictEqual(
        {
          tool: entry.tool,
          exported: source.includes(`function ${fn}(`),
        },
        { tool: entry.tool, exported: true },
      );
      assert.deepStrictEqual(
        {
          tool: entry.tool,
          defined: source.includes(`name: '${entry.tool}'`),
        },
        { tool: entry.tool, defined: true },
      );
    }
  });

  it('every listed tool is shipped, declares background and carries the long-tool words', () => {
    for (const tool of names) {
      const found = groupDefinitions().filter((d) => d.name === tool);
      assert.deepStrictEqual(
        { tool, shipped: found.length > 0 },
        {
          tool,
          shipped: true,
        },
      );
      for (const definition of found) {
        assert.deepStrictEqual(
          {
            tool,
            background: declaresBackground(definition),
            advice: carriesAdvice(definition),
          },
          { tool, background: true, advice: true },
        );
      }
    }
  });

  it('no tool off the list declares background — but the code-running tools — or carries the long-tool words', () => {
    const offending = definitions
      .filter((d) => !names.has(d.name))
      .filter(
        (d) =>
          (declaresBackground(d) && !isBackgroundTool(d.name)) ||
          carriesAdvice(d),
      )
      .map((d) => d.name);
    assert.deepStrictEqual(offending, []);
  });

  it('the check sees a declared timeout (load-bearing)', () => {
    assert.equal(
      declaresTimeout({
        name: 'X',
        description: '',
        inputSchema: z.object({ timeout: z.any().optional() }),
      }),
      true,
    );
    assert.equal(
      declaresTimeout({
        name: 'X',
        description: '',
        inputSchema: z.object({ other: z.any().optional() }),
      }),
      false,
    );
  });
});
