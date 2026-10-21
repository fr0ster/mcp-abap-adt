/**
 * The approved list of long tools is the one place a
 * `timeout` comes from: `tools/long-handlers.json` names every tool the user
 * approved, tool by tool, with its handler and what it sends. Every tool on
 * it declares `timeout` and carries the advice in its description; no tool
 * off it does either — whichever group registers it, full or compact. The
 * server's own list (`LONG_TOOLS`, what the wrapper reads) is the JSON's.
 * Every listed tool is a read: its `timeout` cuts it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { compactDebugEntries } from '../../../lib/compact/debug/group';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type {
  HandlerContext,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { LONG_TOOL_ADVICE, LONG_TOOLS } from '../../../lib/longTools';

const REPO = path.resolve(__dirname, '../../../..');

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
      includeDebug: true,
    })
      .getHandlerEntries()
      .map((e) => e.toolDefinition),
    ...new CompactReadOnlyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...new CompactModifyHandlersGroup(placeholder)
      .getHandlers()
      .map((e) => e.toolDefinition),
    ...compactDebugEntries().map((e) => e.toolDefinition),
  ];
}

/** Whether a schema declares `timeout`, JSON Schema or a zod raw shape. */
function declaresTimeout(definition: ToolDefinition): boolean {
  const schema = definition.inputSchema as
    | { properties?: Record<string, unknown> }
    | Record<string, unknown>
    | undefined;
  if (!schema) return false;
  const properties =
    (schema as { properties?: Record<string, unknown> }).properties ?? schema;
  return Object.hasOwn(properties, 'timeout');
}

const carriesAdvice = (definition: ToolDefinition) =>
  definition.description.includes(LONG_TOOL_ADVICE);

describe('the approved list of long tools', () => {
  const definitions = shippedDefinitions();
  const names = new Set(listed().map((l) => l.tool));

  it('sees every shipped tool, so the checks below are not vacuous', () => {
    // 19.0.0: the low set's 112 tools left the surface.
    expect(definitions.length).toBeGreaterThan(250);
  });

  it("the server's list is the JSON's, each tool once", () => {
    const tools = listed().map((l) => l.tool);
    expect(new Set(tools).size).toBe(tools.length);
    expect([...tools].sort()).toEqual([...LONG_TOOLS].sort());
  });

  it('the tools that start a run or run code are off the list and take no timeout', () => {
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
      expect({ tool, listed: names.has(tool) }).toEqual({
        tool,
        listed: false,
      });
      const found = definitions.filter((d) => d.name === tool);
      expect({ tool, shipped: found.length > 0 }).toEqual({
        tool,
        shipped: true,
      });
      for (const definition of found) {
        expect({ tool, timeout: declaresTimeout(definition) }).toEqual({
          tool,
          timeout: false,
        });
      }
    }
  });

  it('every listed entry names its set, a handler that exists and what it sends', () => {
    for (const entry of listed()) {
      expect(['full', 'compact']).toContain(entry.set);
      expect(entry.sends.trim()).not.toBe('');
      const [file, fn] = entry.handler.split('#');
      const source = fs.readFileSync(path.join(REPO, file ?? ''), 'utf8');
      expect({
        tool: entry.tool,
        exported: source.includes(`function ${fn}(`),
      }).toEqual({ tool: entry.tool, exported: true });
      expect({
        tool: entry.tool,
        defined: source.includes(`name: '${entry.tool}'`),
      }).toEqual({ tool: entry.tool, defined: true });
    }
  });

  it('every listed tool is shipped, declares timeout and carries the advice', () => {
    for (const tool of names) {
      const found = definitions.filter((d) => d.name === tool);
      expect({ tool, shipped: found.length > 0 }).toEqual({
        tool,
        shipped: true,
      });
      for (const definition of found) {
        expect({
          tool,
          timeout: declaresTimeout(definition),
          advice: carriesAdvice(definition),
        }).toEqual({ tool, timeout: true, advice: true });
      }
    }
  });

  it('no tool off the list declares timeout or carries the advice', () => {
    const offending = definitions
      .filter((d) => !names.has(d.name))
      .filter((d) => declaresTimeout(d) || carriesAdvice(d))
      .map((d) => d.name);
    expect(offending).toEqual([]);
  });

  it('the check sees a timeout in both schema shapes (load-bearing)', () => {
    expect(
      declaresTimeout({
        name: 'X',
        description: '',
        inputSchema: { type: 'object', properties: { timeout: {} } },
      }),
    ).toBe(true);
    expect(
      declaresTimeout({
        name: 'X',
        description: '',
        inputSchema: { timeout: {} },
      }),
    ).toBe(true);
    expect(
      declaresTimeout({
        name: 'X',
        description: '',
        inputSchema: { type: 'object', properties: { other: {} } },
      }),
    ).toBe(false);
  });
});
