/**
 * `abstract` (CreateClass) and `program_type` (CreateProgram, HandlerCreate
 * PROGRAM) are gone (plan D2, step 6a): SAP ignores both on create
 * (measured on premise — an `abstract` create gave a class that is not
 * abstract, and every program type gave an executable program). No listed
 * schema names either, and a call that still gives one is refused as any
 * argument a create schema does not declare (the owner): before any
 * request, naming it.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { listedTool, statedEnvironment } from '../../lib/listedTool';
import { resetSystemContextCache } from '../../lib/systemContext';
import { listedJson } from '../helpers/listedJson';
import { recordCase, servedEntries } from '../helpers/pinCases';
import { setSystemContext } from '../helpers/processSystemContext';
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
  for (const [tool, variant, removed] of [
    ['CreateClass', 'onprem', 'abstract'],
    ['CreateClass', 'cloud', 'abstract'],
    ['CreateProgram', 'onprem', 'program_type'],
    ['HandlerCreate', 'onprem', 'program_type'],
    ['HandlerCreate', 'cloud', 'program_type'],
  ] as const) {
    it(format('%s (%s) lists no %s', tool, variant, removed), () => {
      const properties = listedProperties(tool, variant);
      assert.ok(properties.length > 0);
      assert.ok(!properties.includes(removed));
    });
  }
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

/** `args` as Jest rendered it in the `$args` title: keys sorted, `"key": value`. */
const shownArgs = (args: Readonly<Record<string, string | boolean>>) =>
  `{${Object.keys(args)
    .sort()
    .map((key) => `"${key}": ${JSON.stringify(args[key])}`)
    .join(', ')}}`;

describe('a call that still gives abstract or program_type: refused before any request, naming it', () => {
  for (const { tool, variant, args, option } of GIVEN) {
    it(`${tool} (${variant}) ${shownArgs(args)}`, async () => {
      const recording = await recordCase({
        tool,
        variant,
        stand: 'recording',
        args,
        expected: 'none',
      });
      assert.deepStrictEqual(recording.requests, []);
      const message =
        recording.thrown instanceof Error ? recording.thrown.message : '';
      assert.ok(message.includes(`${option} is not an argument of ${tool}`));
    });
  }
});
