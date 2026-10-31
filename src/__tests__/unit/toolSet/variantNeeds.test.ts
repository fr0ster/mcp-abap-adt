/**
 * What each tool needs of the declared variant's ADT type table
 * (`variantToolSet.ts`), held to the tool set and to the tables.
 *
 * - Every tool of the object-oriented groups is classified: it names the one
 *   API operation it needs (`TOOL_NEEDS`), or it works on no single API
 *   (`TOOLS_WITHOUT_NEED`) — never both, never neither. A new tool has to be
 *   placed, so the gate cannot silently miss it.
 * - Every need is one some table serves (on premise above all: no tool of
 *   that variant is lost by a mistyped need).
 * - The gate reads the table: a need a table does not list is not served
 *   there (`variantServes`), and a tool that states itself per variant
 *   (`variants`, from the projections) is registered as it states itself on
 *   the declared one.
 */

import {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
} from '@mcp-abap-adt/interfaces-adt';
import {
  DebugHandlersGroup,
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  RuntimeRunHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../../lib/handlers/groups/index.js';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  servedDefinition,
  TOOL_NEEDS,
  TOOLS_WITHOUT_NEED,
  variantOfEnvironment,
  variantServes,
} from '../../../lib/variantToolSet';

const context: HandlerContext = noConnectionContext();

const objectOrientedTools = [
  new ReadOnlyHandlersGroup(context),
  new HighLevelHandlersGroup(context),
  new SystemHandlersGroup(context),
  new RuntimeRunHandlersGroup(context),
  new SearchHandlersGroup(context),
  new DebugHandlersGroup(context),
].flatMap((group) => group.getHandlers().map((entry) => entry.toolDefinition));

const names = [...new Set(objectOrientedTools.map((tool) => tool.name))];

describe('every tool of the object-oriented groups is classified', () => {
  it('names a need or none, never both', () => {
    const both = names.filter(
      (name) => TOOL_NEEDS.has(name) && TOOLS_WITHOUT_NEED.has(name),
    );
    const neither = names.filter(
      (name) => !TOOL_NEEDS.has(name) && !TOOLS_WITHOUT_NEED.has(name),
    );
    expect({ both, neither }).toEqual({ both: [], neither: [] });
  });

  it('names no tool the groups do not have', () => {
    const known = new Set(names);
    expect(
      [...TOOL_NEEDS.keys(), ...TOOLS_WITHOUT_NEED].filter(
        (name) => !known.has(name),
      ),
    ).toEqual([]);
  });
});

describe('the needs against the tables', () => {
  it('every tool need is one ADT_TYPES_ONPREM lists', () => {
    const unserved = [...TOOL_NEEDS].filter(
      ([, need]) => !variantServes('onprem', need),
    );
    expect(unserved).toEqual([]);
  });

  it('a need a table does not list is not served there', () => {
    // ADT_TYPES_CLOUD lists a program's read, never its create or run.
    expect(ADT_TYPES_CLOUD.program.codes['PROG/P'].operations).not.toContain(
      'create',
    );
    expect(variantServes('cloud', { api: 'program', operation: 'read' })).toBe(
      true,
    );
    expect(
      variantServes('cloud', { api: 'program', operation: 'create' }),
    ).toBe(false);
    expect(variantServes('cloud', { api: 'program', operation: 'run' })).toBe(
      false,
    );
    expect(variantServes('onprem', { api: 'program', operation: 'run' })).toBe(
      true,
    );
    // A codeless entry reads its own operations.
    expect(ADT_TYPES_ONPREM.request.operations).toContain('createTask');
    expect(
      variantServes('cloud', { api: 'request', operation: 'createTask' }),
    ).toBe(true);
  });

  it('legacy reads the on-premise table, cloud its own', () => {
    expect(variantOfEnvironment('onprem')).toBe('onprem');
    expect(variantOfEnvironment('legacy')).toBe('onprem');
    expect(variantOfEnvironment('cloud')).toBe('cloud');
  });
});

describe('servedDefinition', () => {
  const tool = (name: string, inputSchema: object) => ({
    name,
    description: name,
    inputSchema,
  });

  it('drops a tool whose need the table does not list, keeps it where it does', () => {
    const definition = tool('RuntimeRunProgram', { type: 'object' });
    expect(servedDefinition(definition, 'cloud')).toBeUndefined();
    expect(servedDefinition(definition, 'onprem')).toBe(definition);
  });

  it('keeps a tool with no need on every variant', () => {
    const definition = tool('SearchObject', { type: 'object' });
    expect(servedDefinition(definition, 'cloud')).toBe(definition);
    expect(servedDefinition(definition, 'onprem')).toBe(definition);
  });

  it('a tool that states itself per variant is registered as it states itself there', () => {
    const definition = {
      ...tool('HandlerProfileRun', { type: 'object', properties: {} }),
      variants: {
        onprem: { description: 'on premise', inputSchema: { onprem: true } },
        cloud: { description: 'on cloud', inputSchema: { cloud: true } },
      },
    };
    expect(servedDefinition(definition, 'cloud')).toEqual({
      ...definition,
      description: 'on cloud',
      inputSchema: { cloud: true },
    });
    expect(servedDefinition(definition, 'onprem')).toEqual({
      ...definition,
      description: 'on premise',
      inputSchema: { onprem: true },
    });
  });
});
