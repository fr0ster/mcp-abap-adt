/**
 * An ABAP Unit run target (`AbapUnitRunTarget` of interfaces-adt) as a tool
 * takes it: the `target` schema property and its boundary mapping, shared by
 * `RunAbapUnit` and compact `HandlerUnitTestRun`.
 *
 * The endpoint answers a type it does not run with an empty result, not a
 * refusal (adt-clients' measurements), so the type is checked here, against
 * the registry's keys (`ABAP_UNIT_RUN_TYPES`), before anything is sent.
 */

import {
  ABAP_UNIT_RUN_TYPES,
  type AbapUnitRunObjectType,
  type AbapUnitRunTarget,
} from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';

/** Whether `value` is a key of the run registry. */
function isRunObjectType(value: string): value is AbapUnitRunObjectType {
  return Object.hasOwn(ABAP_UNIT_RUN_TYPES, value);
}

/** Every `osl:object type` a run may name: the keys of `ABAP_UNIT_RUN_TYPES`, in its order. */
export const ABAP_UNIT_RUN_OBJECT_TYPES: readonly AbapUnitRunObjectType[] =
  Object.keys(ABAP_UNIT_RUN_TYPES).filter(isRunObjectType);

/** The run target kinds, as `AbapUnitRunTarget` discriminates them. */
const TARGET_KINDS: readonly AbapUnitRunTarget['kind'][] = [
  'object',
  'package',
];

const RUN_TARGET_WORDS =
  'What the run covers: an object (kind object, name, type) or a package (kind package, name, include_subpackages).';

/** A run target's own fields, as a zod object. */
const RUN_TARGET_OBJECT = z.object({
  kind: z
    .enum(TARGET_KINDS)
    .describe(
      'object: one object, named by name and type. package: one package, named by name.',
    ),
  name: z.string().describe('Name of the object or the package.'),
  type: z
    .enum(ABAP_UNIT_RUN_OBJECT_TYPES)
    .optional()
    .describe('Run object type of the object (kind object; required there).'),
  include_subpackages: z
    .boolean()
    .optional()
    .describe(
      "Whether the run covers the package's subpackages too (kind package; required there).",
    ),
});

/** The `target` field of a tool that runs ABAP Unit by a run target, as a zod schema; required where it is declared. */
export const RUN_TARGET_FIELD = RUN_TARGET_OBJECT.describe(RUN_TARGET_WORDS);

/** The `target` field where a tool takes it optionally. */
export const RUN_TARGET_OPTIONAL =
  RUN_TARGET_OBJECT.optional().describe(RUN_TARGET_WORDS);

/** The `target` argument as the schema above declares it. */
export type RunTargetArgs = z.output<typeof RUN_TARGET_OBJECT>;

/**
 * The run target `given` names, as the runner takes it: the name
 * upper-cased; an `Error` naming what is wrong, before anything is sent. The
 * schema has typed each field; what is checked here is what it cannot say:
 * a non-blank name and the fields each kind reads.
 */
export function runTargetOf(given: RunTargetArgs): AbapUnitRunTarget | Error {
  const runName = given.name.trim().toUpperCase();
  if (runName === '') {
    return new Error('target.name is required; nothing was sent');
  }
  if (given.kind === 'object') {
    if (given.include_subpackages !== undefined) {
      return new Error(
        'target.include_subpackages is read for kind package only; nothing was sent',
      );
    }
    if (given.type === undefined) {
      return new Error(
        `target.type is required for kind object, one of: ${ABAP_UNIT_RUN_OBJECT_TYPES.join(', ')}; nothing was sent`,
      );
    }
    return { kind: 'object', name: runName, type: given.type };
  }
  if (given.type !== undefined) {
    return new Error(
      'target.type is read for kind object only; nothing was sent',
    );
  }
  if (given.include_subpackages === undefined) {
    return new Error(
      'target.include_subpackages (true or false) is required for kind package; nothing was sent',
    );
  }
  return {
    kind: 'package',
    name: runName,
    includeSubpackages: given.include_subpackages,
  };
}

/** Flags as a run tool's schema gives them, each `true`, `false` or left out. */
export type FlagArgs<K extends string> = {
  readonly [P in K]?: boolean | undefined;
};

/**
 * The flags `given` names, each present only when given: the runner's
 * options declare their flags without `| undefined`.
 */
export function flagsOf<K extends string>(
  given: FlagArgs<K> | undefined,
  keys: readonly K[],
): Partial<Record<K, boolean>> | undefined {
  if (given === undefined) return undefined;
  const flags: Partial<Record<K, boolean>> = {};
  for (const key of keys) {
    const value = given[key];
    if (value !== undefined) flags[key] = value;
  }
  return flags;
}

/** What a run tool's arguments say of the run's flags. */
export interface RunFlagArgs {
  readonly scope?:
    | FlagArgs<'own_tests' | 'foreign_tests' | 'add_foreign_tests_as_preview'>
    | undefined;
  readonly risk_level?:
    | FlagArgs<'harmless' | 'dangerous' | 'critical'>
    | undefined;
  readonly duration?: FlagArgs<'short' | 'medium' | 'long'> | undefined;
}

/** The run's flags `args` names: scope, risk levels, durations. */
export function runFlagsOf(args: RunFlagArgs) {
  return {
    scope: flagsOf(args.scope, [
      'own_tests',
      'foreign_tests',
      'add_foreign_tests_as_preview',
    ]),
    riskLevel: flagsOf(args.risk_level, ['harmless', 'dangerous', 'critical']),
    duration: flagsOf(args.duration, ['short', 'medium', 'long']),
  };
}
