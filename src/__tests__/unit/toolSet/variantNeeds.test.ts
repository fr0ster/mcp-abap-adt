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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import {
  DataHandlersGroup,
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
  new DataHandlersGroup(context),
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
    assert.deepStrictEqual({ both, neither }, { both: [], neither: [] });
  });

  it('names no tool the groups do not have', () => {
    const known = new Set(names);
    assert.deepStrictEqual(
      [...TOOL_NEEDS.keys(), ...TOOLS_WITHOUT_NEED].filter(
        (name) => !known.has(name),
      ),
      [],
    );
  });
});

describe('the needs against the tables', () => {
  it('every tool need is one ADT_TYPES_ONPREM lists', () => {
    const unserved = [...TOOL_NEEDS].filter(
      ([, need]) => !variantServes('onprem', need),
    );
    assert.deepStrictEqual(unserved, []);
  });

  it('a need a table does not list is not served there', () => {
    // ADT_TYPES_CLOUD lists a program's read, never its create or run.
    // Widened to strings, so includes() takes any value.
    const operations: readonly string[] =
      ADT_TYPES_CLOUD.program.codes['PROG/P'].operations;
    assert.ok(!operations.includes('create'));
    assert.equal(
      variantServes('cloud', { api: 'program', operation: 'read' }),
      true,
    );
    assert.equal(
      variantServes('cloud', { api: 'program', operation: 'create' }),
      false,
    );
    assert.equal(
      variantServes('cloud', { api: 'program', operation: 'run' }),
      false,
    );
    assert.equal(
      variantServes('onprem', { api: 'program', operation: 'run' }),
      true,
    );
    // A codeless entry reads its own operations.
    assert.ok(ADT_TYPES_ONPREM.request.operations.includes('createTask'));
    assert.equal(
      variantServes('cloud', { api: 'request', operation: 'createTask' }),
      true,
    );
  });

  it('legacy reads the on-premise table, cloud its own', () => {
    assert.equal(variantOfEnvironment('onprem'), 'onprem');
    assert.equal(variantOfEnvironment('legacy'), 'onprem');
    assert.equal(variantOfEnvironment('cloud'), 'cloud');
  });
});

describe('servedDefinition', () => {
  const tool = (name: string, inputSchema: z.ZodObject) => ({
    name,
    description: name,
    inputSchema,
  });

  it('drops a tool whose need the table does not list, keeps it where it does', () => {
    const definition = tool('RuntimeRunProgram', z.object({}));
    assert.equal(servedDefinition(definition, 'cloud'), undefined);
    assert.equal(servedDefinition(definition, 'onprem'), definition);
  });

  it('keeps a tool with no need on every variant', () => {
    const definition = tool('SearchObject', z.object({}));
    assert.equal(servedDefinition(definition, 'cloud'), definition);
    assert.equal(servedDefinition(definition, 'onprem'), definition);
  });

  it('a tool that states itself per variant is registered as it states itself there', () => {
    const onprem = z.object({ onprem: z.boolean() });
    const cloud = z.object({ cloud: z.boolean() });
    const definition = {
      ...tool('HandlerProfileRun', z.object({})),
      variants: {
        onprem: { description: 'on premise', inputSchema: onprem },
        cloud: { description: 'on cloud', inputSchema: cloud },
      },
    };
    assert.deepStrictEqual(servedDefinition(definition, 'cloud'), {
      ...definition,
      description: 'on cloud',
      inputSchema: cloud,
    });
    assert.equal(servedDefinition(definition, 'cloud')?.inputSchema, cloud);
    assert.deepStrictEqual(servedDefinition(definition, 'onprem'), {
      ...definition,
      description: 'on premise',
      inputSchema: onprem,
    });
    assert.equal(servedDefinition(definition, 'onprem')?.inputSchema, onprem);
  });
});
