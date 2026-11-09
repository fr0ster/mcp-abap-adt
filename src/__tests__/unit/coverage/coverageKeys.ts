/**
 * Coverage keys (spec §8, "What counts"): what a pin row and a live case
 * stand for, derived from the call, never from a label.
 *
 * A key is the tool, then one `#value` per enum dimension the tool declares,
 * in the fixed order `object_type`, `part`, `operation`, `action`
 * (`HandlerLock#CLASS`, `GetClass#source`, `HandlerDebugStep#stepInto`,
 * `HandlerGet#CLASS#source`). A dimension left out before a later one reads
 * `-` (`HandlerGet#-#object_structure`, a part `handleHandlerGet` routes
 * before any type); one left out at the end is dropped (`HandlerUpdate#CLASS`,
 * no `part`).
 *
 * Which dimensions a tool declares is read from the listed-schema fixture
 * (`tests/fixtures/tools/listed-schemas.json`): every top-level property of
 * those four names that lists an `enum`, in any listing of the tool. The
 * guard asserts the served list is that fixture, so `keyOf` and
 * `requiredKeys` read the same schemas.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hasSourcePart,
  partsFor,
} from '../../../../compact-readonly-entries/src/handlers/compactPartRoutes';
import { PART_TYPES } from '../../../handlers/common/low/handleUpdateUnderLock';
import { COMPACT_READ } from '../../../lib/adtProjections';
import { EMPTIED_INCLUDE_TYPES } from '../../../lib/compact/compactSchemas';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import { repositoryRoot } from '../../helpers/repoRoot';
import type {
  ListedSchema,
  ServedTool,
  SystemKind,
} from '../../helpers/servedTools';

export type { ToolArgs };

/** A coverage key: the tool, then `#value` per enum dimension it declares. */
export type CoverageKey = string;

/** The key dimensions, in the order a key names them. */
export const DIMENSIONS = [
  'object_type',
  'part',
  'operation',
  'action',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Whether `name` is one of the key dimensions. */
export const isDimension = (name: string): name is Dimension =>
  DIMENSIONS.some((dimension) => dimension === name);

const REPO = repositoryRoot(__dirname);
export const LISTED_SCHEMAS = path.join(
  REPO,
  'tests',
  'fixtures',
  'tools',
  'listed-schemas.json',
);

/** A JSON value's member, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** The string members of an `enum` list; `undefined` when `value` lists none. */
function enumOf(value: unknown): readonly string[] | undefined {
  const listed = member(value, 'enum');
  if (!Array.isArray(listed)) return undefined;
  return listed.filter((each): each is string => typeof each === 'string');
}

/** A listed schema's enum per key dimension, for the dimensions it declares. */
export function schemaEnums(
  schema: ListedSchema | unknown,
): ReadonlyMap<Dimension, readonly string[]> {
  const properties = member(schema, 'properties');
  const enums = new Map<Dimension, readonly string[]>();
  for (const dimension of DIMENSIONS) {
    const values = enumOf(member(properties, dimension));
    if (values !== undefined) enums.set(dimension, values);
  }
  return enums;
}

/** Tool → the key dimensions any of its listings declares, read once. */
let declared: ReadonlyMap<string, readonly Dimension[]> | undefined;

function declaredDimensions(tool: string): readonly Dimension[] {
  if (declared === undefined) {
    const fixture: unknown = JSON.parse(
      fs.readFileSync(LISTED_SCHEMAS, 'utf8'),
    );
    const schemas = member(fixture, 'schemas');
    const table = new Map<string, readonly Dimension[]>();
    if (typeof schemas === 'object' && schemas !== null) {
      for (const [name, listed] of Object.entries(schemas)) {
        const found = new Set<Dimension>();
        if (Array.isArray(listed)) {
          for (const each of listed) {
            for (const dimension of schemaEnums(member(each, 'value')).keys()) {
              found.add(dimension);
            }
          }
        }
        table.set(
          name,
          DIMENSIONS.filter((dimension) => found.has(dimension)),
        );
      }
    }
    declared = table;
  }
  return declared.get(tool) ?? [];
}

/** The key of `tool` from the values `args` gives its dimensions. */
function keyFrom(
  tool: string,
  dimensions: readonly Dimension[],
  valueFor: (dimension: Dimension) => string | undefined,
): CoverageKey {
  const values = dimensions.map(valueFor);
  let last = values.length;
  while (last > 0 && values[last - 1] === undefined) last -= 1;
  const named = values.slice(0, last).map((value) => value ?? '-');
  return [tool, ...named].join('#');
}

/**
 * The one function that turns a call into its key: `pinCases`, `liveCall`
 * and `ledgerScan` all use it.
 */
export function keyOf(tool: string, args: ToolArgs): CoverageKey {
  return keyFrom(tool, declaredDimensions(tool), (dimension) => {
    const value = args[dimension];
    return typeof value === 'string' ? value : undefined;
  });
}

/** The parts `handleHandlerGet` routes before any `object_type` is read. */
export const TYPELESS_PARTS = [
  'object_structure',
  'node_structure',
  'virtual_folders',
  'activation_status',
  'activation_results',
] as const;

/** Whether `part` is one `handleHandlerGet` routes before any type. */
export const isTypelessPart = (part: string): boolean =>
  TYPELESS_PARTS.some((typeless) => typeless === part);

/** The parts of an include `HandlerUpdate` writes (`handleUpdateUnderLock.ts`). */
export const INCLUDE_PARTS = ['source', 'metadata'] as const;

/** `HandlerGet`'s keys on `variant`: its route tables, never the product of its two enums. */
function handlerGetKeys(
  variant: SystemKind,
  enums: ReadonlyMap<Dimension, readonly string[]>,
): CoverageKey[] {
  const types = enums.get('object_type') ?? [];
  const parts = new Set(enums.get('part') ?? []);
  const keys: CoverageKey[] = [];
  for (const type of types) {
    const routed = COMPACT_READ[variant].find((each) => each === type);
    if (routed === undefined) continue;
    for (const part of partsFor(routed, hasSourcePart(routed), variant)) {
      if (parts.has(part)) keys.push(`HandlerGet#${type}#${part}`);
    }
  }
  for (const part of TYPELESS_PARTS) {
    if (parts.has(part)) keys.push(`HandlerGet#-#${part}`);
  }
  return keys;
}

/**
 * `HandlerUpdate`'s keys: every type with `part` left out (`INCLUDE`'s
 * source write included), and the include's parts where the variant lists
 * `INCLUDE` — `partRefusal` refuses any other type or part.
 */
function handlerUpdateKeys(
  enums: ReadonlyMap<Dimension, readonly string[]>,
): CoverageKey[] {
  const types = enums.get('object_type') ?? [];
  const parts = new Set(enums.get('part') ?? []);
  const keys = types.map((type) => `HandlerUpdate#${type}`);
  for (const type of types) {
    if (!PART_TYPES.some((taker) => taker === type)) continue;
    for (const part of INCLUDE_PARTS) {
      if (parts.has(part)) keys.push(`HandlerUpdate#${type}#${part}`);
    }
  }
  return keys;
}

/** The tools whose keys come from a declared table. */
const TABLES: Readonly<
  Record<
    string,
    (
      variant: SystemKind,
      enums: ReadonlyMap<Dimension, readonly string[]>,
    ) => CoverageKey[]
  >
> = {
  HandlerGet: handlerGetKeys,
  HandlerUpdate: (_variant, enums) => handlerUpdateKeys(enums),
};

/** The keys one served tool requires on its variant. */
function keysOfServed(tool: ServedTool): CoverageKey[] {
  const enums = schemaEnums(tool.schema);
  const table = TABLES[tool.name];
  if (table !== undefined) return table(tool.variant, enums);
  if (enums.size > 1) {
    throw new Error(
      `${tool.name} declares ${[...enums.keys()].join(' and ')}: a tool of two key dimensions needs its declared table in coverageKeys.ts`,
    );
  }
  const [only] = [...enums];
  if (only === undefined) return [tool.name];
  const [dimension, values] = only;
  return values.map((value) => keyFrom(tool.name, [dimension], () => value));
}

/**
 * Every key the served tools require, with the system kinds that require
 * it: a kind requires a key when a binary of that variant lists it.
 */
export function requiredKeys(
  served: readonly ServedTool[],
): ReadonlyMap<CoverageKey, ReadonlySet<SystemKind>> {
  const required = new Map<CoverageKey, Set<SystemKind>>();
  for (const tool of served) {
    for (const key of keysOfServed(tool)) {
      const kinds = required.get(key) ?? new Set<SystemKind>();
      kinds.add(tool.variant);
      required.set(key, kinds);
    }
  }
  return required;
}

/**
 * The keys of tools that send nothing on success (spec §8): their pin is
 * `expected: 'none'`, asserting the tool ran.
 */
export const SENDS_NOTHING: ReadonlySet<CoverageKey> = new Set([
  'BatchBegin',
  'BatchAnswers',
  'GetBackgroundRun',
  'ListBackgroundRuns',
  'DiscardBackgroundRun',
  'HandlerBackgroundRunGet',
  'HandlerBackgroundRunList',
  'HandlerBackgroundRunDiscard',
  'HandlerBatch#begin',
  'HandlerBatch#answers',
]);

/**
 * The full deletes that empty a part and keep their object (each writes its
 * class include empty, `DeleteUnitTest` the test include), per their
 * handlers.
 */
const CLEARING_DELETES: ReadonlySet<string> = new Set([
  'DeleteLocalDefinitions',
  'DeleteLocalMacros',
  'DeleteLocalTypes',
  'DeleteLocalTestClass',
  'DeleteUnitTest',
]);

/**
 * How a delete key's live case asserts its delete: `expectAbsent` for a
 * delete that removes its object, `expectCleared` for one that empties a
 * part (`HandlerDelete` of `EMPTIED_INCLUDE_TYPES`, `handleDeleteOnly.ts`);
 * `undefined` for a key that is no delete.
 */
export function deleteCheckOf(
  key: CoverageKey,
): 'expectAbsent' | 'expectCleared' | undefined {
  const [tool = '', type] = key.split('#');
  if (tool === 'HandlerDelete') {
    return EMPTIED_INCLUDE_TYPES.some((emptied) => emptied === type)
      ? 'expectCleared'
      : 'expectAbsent';
  }
  if (!tool.startsWith('Delete')) return undefined;
  return CLEARING_DELETES.has(tool) ? 'expectCleared' : 'expectAbsent';
}

/** Deletes whose object is read back by a tool not named `Get<Type>`. */
const READERS: Readonly<Record<string, string>> = {
  // Writes the class's test include empty; the class stays.
  DeleteUnitTest: 'GetLocalTestClass',
  // Removes the CDS unit test's test class (`deletionTargets.ts`).
  DeleteCdsUnitTest: 'GetClass',
};

/**
 * The tool that reads back what a delete key deleted: `HandlerGet` for
 * `HandlerDelete` (on the same `object_type`), else `Get<Type>` for
 * `Delete<Type>` (`READERS` naming the exceptions); `undefined` for a key
 * that is no delete.
 */
export function readerOf(key: CoverageKey): string | undefined {
  const [tool = ''] = key.split('#');
  if (deleteCheckOf(key) === undefined) return undefined;
  if (tool === 'HandlerDelete') return 'HandlerGet';
  return READERS[tool] ?? `Get${tool.slice('Delete'.length)}`;
}

/** A call's arguments that say how it runs, not which object it names. */
export const OPERATIONAL_ARGUMENTS: ReadonlySet<string> = new Set([
  'transport_request',
  'lock_handle',
  'detail',
  'timeout',
]);
