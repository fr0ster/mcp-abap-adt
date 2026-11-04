/**
 * `abstract` (CreateClass) and `program_type` (CreateProgram, HandlerCreate
 * PROGRAM) are gone (plan D2, step 6a): SAP ignores both on create
 * (measured on premise — an `abstract` create gave a class that is not
 * abstract, and every program type gave an executable program). No listed
 * schema names either, and a call that still gives one is parsed as any
 * argument the schema does not declare: dropped, so the create carries no
 * `class:abstract` and no `program:programType`.
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

/** A create given the removed option: the tool, its arguments, the attribute it wrote. */
const GIVEN = [
  {
    tool: 'CreateClass',
    variant: 'onprem',
    args: { class_name: 'ZCL_PIN', package_name: 'ZPIN_PKG', abstract: true },
    attribute: 'class:abstract',
  },
  {
    tool: 'CreateClass',
    variant: 'cloud',
    args: { class_name: 'ZCL_PIN', package_name: 'ZPIN_PKG', abstract: true },
    attribute: 'class:abstract',
  },
  {
    tool: 'CreateProgram',
    variant: 'onprem',
    args: {
      program_name: 'ZPIN_PROG',
      package_name: 'ZPIN_PKG',
      program_type: 'module_pool',
    },
    attribute: 'program:programType',
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
    attribute: 'program:programType',
  },
] as const;

describe('a call that still gives abstract or program_type: dropped, as any argument the schema does not declare', () => {
  it.each(GIVEN)(
    '$tool ($variant) $args',
    async ({ tool, variant, args, attribute }) => {
      const recording = await recordCase({
        tool,
        variant,
        stand: 'recording',
        args,
        expected: 'none',
      });
      expect(recording.thrown).toBeUndefined();
      const creates = recording.requests.filter(
        (request) => request.method === 'POST',
      );
      expect(creates).toHaveLength(1);
      expect(creates[0]?.body).not.toContain(attribute);
    },
  );
});
