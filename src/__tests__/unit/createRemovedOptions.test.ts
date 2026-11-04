/**
 * `abstract` (CreateClass) and `program_type` (CreateProgram, HandlerCreate
 * PROGRAM) are gone (plan D2, step 6a): SAP ignores both on create
 * (measured on premise — an `abstract` create gave a class that is not
 * abstract, and every program type gave an executable program). No listed
 * schema names either, and a call that still gives one is refused as any
 * argument a create schema does not declare (the owner): before any
 * request, naming it.
 */

import { listedTool, statedEnvironment } from '../../lib/listedTool';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { listedJson } from '../helpers/listedJson';
import { recordCase, servedEntries } from '../helpers/pinCases';
import type { SystemKind } from '../helpers/servedTools';

beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

/** The properties `tool` lists on `variant`. */
function listedProperties(tool: string, variant: SystemKind): string[] {
  const entry = servedEntries(variant).get(tool);
  if (entry === undefined) throw new Error(`${variant} lists no ${tool}`);
  const listed = listedTool(entry.toolDefinition, statedEnvironment(variant));
  if (!listed.listed) throw new Error(`${variant} lists no ${tool}`);
  return Object.keys(listedJson(listed.inputSchema).properties ?? {});
}

describe('no listed schema names abstract or program_type', () => {
  it.each([
    ['CreateClass', 'onprem', 'abstract'],
    ['CreateClass', 'cloud', 'abstract'],
    ['CreateProgram', 'onprem', 'program_type'],
    ['HandlerCreate', 'onprem', 'program_type'],
    ['HandlerCreate', 'cloud', 'program_type'],
  ] as const)('%s (%s) lists no %s', (tool, variant, removed) => {
    const properties = listedProperties(tool, variant);
    expect(properties.length).toBeGreaterThan(0);
    expect(properties).not.toContain(removed);
  });
});

/** A create given a removed option: the tool, its arguments, the option. */
const GIVEN = [
  {
    tool: 'CreateClass',
    variant: 'onprem',
    args: { class_name: 'ZCL_PIN', package_name: 'ZPIN_PKG', abstract: true },
    option: 'abstract',
  },
  {
    tool: 'CreateClass',
    variant: 'cloud',
    args: { class_name: 'ZCL_PIN', package_name: 'ZPIN_PKG', abstract: true },
    option: 'abstract',
  },
  {
    tool: 'CreateProgram',
    variant: 'onprem',
    args: {
      program_name: 'ZPIN_PROG',
      package_name: 'ZPIN_PKG',
      program_type: 'module_pool',
    },
    option: 'program_type',
  },
  {
    tool: 'HandlerCreate',
    variant: 'onprem',
    args: {
      object_type: 'PROGRAM',
      program_name: 'ZPIN_PROG',
      package_name: 'ZPIN_PKG',
      program_type: 'module_pool',
    },
    option: 'program_type',
  },
] as const;

describe('a call that still gives abstract or program_type: refused before any request, naming it', () => {
  it.each(GIVEN)(
    '$tool ($variant) $args',
    async ({ tool, variant, args, option }) => {
      const recording = await recordCase({
        tool,
        variant,
        stand: 'recording',
        args,
        expected: 'none',
      });
      expect(recording.requests).toEqual([]);
      const message =
        recording.thrown instanceof Error ? recording.thrown.message : '';
      expect(message).toContain(`${option} is not an argument of ${tool}`);
    },
  );
});
