/**
 * The definitions a deny list narrows (spec §3.1, plan Task 4): with every
 * value, each narrowing builds the tool's own registered definition; with a
 * value removed, that value is gone from the enum, from the description and
 * from every property description, and from the search members, and every
 * other value stays; with a code removed, the code arguments take the codes
 * left, as written, only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { NARROWINGS } from '../../../lib/access/narrowing';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import { TOOL_DEFINITION as batch } from '../../../lib/compact/batch/handleHandlerBatch';
import { handlerGetDataDefinition } from '../../../lib/compact/compactSchemas';
import { TOOL_DEFINITION as debugBatch } from '../../../lib/compact/debug/handleHandlerDebugBatch';
import { TOOL_DEFINITION as debugBreakpoints } from '../../../lib/compact/debug/handleHandlerDebugBreakpoints';
import { TOOL_DEFINITION as debugMaintain } from '../../../lib/compact/debug/handleHandlerDebugMaintain';
import { TOOL_DEFINITION as debugSession } from '../../../lib/compact/debug/handleHandlerDebugSession';
import { TOOL_DEFINITION as debugStep } from '../../../lib/compact/debug/handleHandlerDebugStep';
import { TOOL_DEFINITION as session } from '../../../lib/compact/longSession/handleHandlerSession';
import type {
  ToolDefinition,
  VariantToolDefinition,
} from '../../../lib/handlers/interfaces';
import { type JsonSchema, listedJson } from '../../helpers/listedJson';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** Every registered definition of a narrowed tool, by name. */
const REGISTERED: ReadonlyMap<string, ToolDefinition> = new Map(
  [
    ...[
      ...compactModifyEntries(),
      ...compactReadOnlyEntries(),
      ...compactDataEntries(),
    ].map((entry) => entry.toolDefinition),
    batch,
    debugBatch,
    session,
    debugSession,
    debugStep,
    debugBreakpoints,
    debugMaintain,
  ].map((definition) => [definition.name, definition]),
);

/** The argument each narrowing's values are the enum of. */
function dispatchOf(tool: string): string {
  if (tool === 'HandlerProfileRun') return 'target_type';
  if (
    tool === 'HandlerBatch' ||
    tool === 'HandlerDebugBatch' ||
    tool === 'HandlerSession'
  ) {
    return 'action';
  }
  if (tool.startsWith('HandlerDebug')) return 'operation';
  return 'object_type';
}

/** What a definition states, as compared: its description, listed schema and members. */
function stated(definition: {
  readonly description: string;
  readonly inputSchema: VariantToolDefinition['inputSchema'];
  readonly members?: readonly string[];
}) {
  return {
    description: definition.description,
    inputSchema: listedJson(definition.inputSchema),
    members: definition.members,
  };
}

/** Every description text of a definition: the tool's and every property's. */
function textsOf(definition: VariantToolDefinition): string[] {
  const texts = [definition.description];
  const walk = (node: JsonSchema) => {
    if (node.description !== undefined) texts.push(node.description);
    for (const child of Object.values(node.properties ?? {})) {
      if (typeof child !== 'boolean') walk(child);
    }
    const items = node.items;
    if (
      items !== undefined &&
      typeof items !== 'boolean' &&
      !Array.isArray(items)
    ) {
      walk(items);
    }
  };
  walk(listedJson(definition.inputSchema));
  return texts;
}

/** Whether `c` continues a value's token (a code holds `/`). */
const tokenCharacter = (c: string | undefined): boolean =>
  c !== undefined &&
  ((c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '/');

/** Prose that holds a value's name as a plain word, not the value. */
const PROSE: ReadonlyArray<readonly [string, string]> = [
  ['DDL', 'Complete DDL source code'],
  ['open', 'an open batch'],
  ['end', "the program's end"],
  ['answers', 'answers with empty content'],
  ['answers', 'answers the number of recorded calls'],
  ['answers', 'answers that error'],
  ['answers', 'then answers it'],
];

/** Whether `text` names `value` as a token of its own, prose left aside. */
function names(text: string, value: string): boolean {
  let plain = text;
  for (const [word, phrase] of PROSE) {
    if (word === value) plain = plain.split(phrase).join('');
  }
  let at = plain.indexOf(value);
  while (at !== -1) {
    if (
      !tokenCharacter(plain[at - 1]) &&
      !tokenCharacter(plain[at + value.length])
    ) {
      return true;
    }
    at = plain.indexOf(value, at + 1);
  }
  return false;
}

/** The enum a property lists, as strings. */
function enumOf(definition: VariantToolDefinition, argument: string): string[] {
  const node = listedJson(definition.inputSchema).properties?.[argument];
  if (node === undefined || typeof node === 'boolean') return [];
  if (node.const !== undefined) return [String(node.const)];
  return (node.enum ?? []).map(String);
}

for (const [tool, narrowing] of NARROWINGS) {
  describe(tool, () => {
    for (const variant of VARIANTS) {
      const all = narrowing.values(variant);
      const registered = REGISTERED.get(tool);

      it(`${variant}: with every value, builds the registered definition`, () => {
        assert.ok(registered !== undefined, `${tool} is registered`);
        const own = registered.variants?.[variant] ?? registered;
        assert.deepEqual(
          stated(narrowing.definition(variant, all, undefined)),
          stated(own),
        );
      });

      if (tool === 'HandlerGetData') continue;
      const argument = dispatchOf(tool);
      for (const removed of all) {
        it(`${variant}: ${removed} removed leaves no trace of it`, () => {
          const left = all.filter((value) => value !== removed);
          const definition = narrowing.definition(variant, left, undefined);
          const listed = enumOf(definition, argument);
          assert.equal(listed.includes(removed), false, 'in the enum');
          for (const value of left) {
            assert.ok(listed.includes(value), `${value} kept in the enum`);
          }
          for (const text of textsOf(definition)) {
            assert.equal(names(text, removed), false, text);
          }
          if (definition.members !== undefined) {
            assert.equal(definition.members.includes(removed), false);
          }
        });
      }

      const codesOf = narrowing.codes;
      if (codesOf === undefined) continue;
      const codes = codesOf(variant);
      for (const removed of codes) {
        it(`${variant}: code ${removed} removed leaves no trace of it`, () => {
          const left = codes.filter((code) => code !== removed);
          const definition = narrowing.definition(variant, all, left);
          assert.equal(
            enumOf(definition, 'object_adt_type').includes(removed),
            false,
          );
          for (const text of textsOf(definition)) {
            assert.equal(names(text, removed), false, text);
          }
          assert.deepEqual(
            enumOf(definition, 'object_type'),
            enumOf(
              narrowing.definition(variant, all, undefined),
              'object_type',
            ),
          );
        });
      }
    }
  });
}

describe('the narrowed cases the plan names', () => {
  const narrowing = (tool: string) => {
    const found = NARROWINGS.get(tool);
    assert.ok(found !== undefined, tool);
    return found;
  };

  it('HandlerBatch with end removed lists begin and answers', () => {
    const definition = narrowing('HandlerBatch').definition(
      'onprem',
      ['begin', 'answers'],
      undefined,
    );
    assert.deepEqual(enumOf(definition, 'action'), ['begin', 'answers']);
  });

  it('HandlerActivate without CLAS/OC: the code arguments take the codes left, as written only', () => {
    const activate = narrowing('HandlerActivate');
    const codes = activate.codes?.('onprem') ?? [];
    const definition = activate.definition(
      'onprem',
      activate.values('onprem'),
      codes.filter((code) => code !== 'CLAS/OC'),
    );
    const objectType = enumOf(definition, 'object_type');
    assert.ok(objectType.includes('CLASS'));
    assert.ok(objectType.includes('BEHAVIOR_IMPLEMENTATION'));
    for (const args of [
      { object_adt_type: 'clas/oc', object_name: 'Z' },
      { object_adt_type: 'CLAS/OC', object_name: 'Z' },
      { objects: [{ name: 'Z', type: 'class' }] },
    ]) {
      assert.equal(definition.inputSchema.safeParse(args).success, false);
    }
    assert.equal(
      definition.inputSchema.safeParse({
        object_adt_type: 'INTF/OI',
        object_name: 'Z',
      }).success,
      true,
    );
  });

  it('HandlerGet without CLAS/OC: object_adt_type lacks it, part keeps every value', () => {
    const get = narrowing('HandlerGet');
    const codes = get.codes?.('onprem') ?? [];
    const definition = get.definition(
      'onprem',
      get.values('onprem'),
      codes.filter((code) => code !== 'CLAS/OC'),
    );
    assert.equal(
      enumOf(definition, 'object_adt_type').includes('CLAS/OC'),
      false,
    );
    assert.deepEqual(
      enumOf(definition, 'part'),
      enumOf(get.definition('onprem', get.values('onprem'), undefined), 'part'),
    );
  });

  it('HandlerGetData without sql names no sql_query', () => {
    const definition = handlerGetDataDefinition(false);
    assert.equal(
      'sql_query' in (listedJson(definition.inputSchema).properties ?? {}),
      false,
    );
    for (const text of textsOf(definition)) {
      assert.equal(text.includes('sql_query'), false, text);
    }
  });
});
