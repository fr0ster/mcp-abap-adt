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

/** The `target` argument as the schema below declares it. */
export interface RunTargetArgs {
  kind: AbapUnitRunTarget['kind'];
  name: string;
  type?: string;
  include_subpackages?: boolean;
}

/** The `target` property of a tool that runs ABAP Unit by a run target. */
export const RUN_TARGET_PROPERTY = {
  target: {
    type: 'object',
    description:
      'What the run covers: an object (kind object, name, type) or a package (kind package, name, include_subpackages).',
    properties: {
      kind: {
        type: 'string',
        enum: TARGET_KINDS,
        description:
          'object: one object, named by name and type. package: one package, named by name.',
      },
      name: {
        type: 'string',
        description: 'Name of the object or the package.',
      },
      type: {
        type: 'string',
        enum: ABAP_UNIT_RUN_OBJECT_TYPES,
        description:
          'Run object type of the object (kind object; required there).',
      },
      include_subpackages: {
        type: 'boolean',
        description:
          "Whether the run covers the package's subpackages too (kind package; required there).",
      },
    },
    required: ['kind', 'name'],
  },
} as const;

/** A field of a caller's object, as given. */
export function fieldOf(given: object, field: string): unknown {
  return Object.hasOwn(given, field)
    ? Object.getOwnPropertyDescriptor(given, field)?.value
    : undefined;
}

/**
 * The run target `given` names, as the runner takes it: the name and an
 * object's type upper-cased; an `Error` naming what is wrong, before anything
 * is sent.
 */
export function runTargetOf(given: unknown): AbapUnitRunTarget | Error {
  if (given === null || typeof given !== 'object') {
    return new Error(
      'target is required: { kind: "object", name, type } or { kind: "package", name, include_subpackages }; nothing was sent',
    );
  }
  const kind = fieldOf(given, 'kind');
  const name = fieldOf(given, 'name');
  if (typeof name !== 'string' || name.trim() === '') {
    return new Error('target.name is required; nothing was sent');
  }
  const runName = name.trim().toUpperCase();
  const type = fieldOf(given, 'type');
  const includeSubpackages = fieldOf(given, 'include_subpackages');
  if (kind === 'object') {
    if (includeSubpackages !== undefined) {
      return new Error(
        'target.include_subpackages is read for kind package only; nothing was sent',
      );
    }
    if (typeof type !== 'string' || type.trim() === '') {
      return new Error(
        `target.type is required for kind object, one of: ${ABAP_UNIT_RUN_OBJECT_TYPES.join(', ')}; nothing was sent`,
      );
    }
    const upper = type.trim().toUpperCase();
    if (!isRunObjectType(upper)) {
      return new Error(
        `target.type "${type}" is not one of: ${ABAP_UNIT_RUN_OBJECT_TYPES.join(', ')}; nothing was sent`,
      );
    }
    return { kind: 'object', name: runName, type: upper };
  }
  if (kind === 'package') {
    if (type !== undefined) {
      return new Error(
        'target.type is read for kind object only; nothing was sent',
      );
    }
    if (typeof includeSubpackages !== 'boolean') {
      return new Error(
        'target.include_subpackages (true or false) is required for kind package; nothing was sent',
      );
    }
    return { kind: 'package', name: runName, includeSubpackages };
  }
  return new Error(
    `target.kind ${JSON.stringify(kind)} is not one of: ${TARGET_KINDS.join(', ')}; nothing was sent`,
  );
}

/**
 * The flags `field` of `args` names, each `true`, `false` or left out (the
 * runner's default); an `Error` for any other value, before anything is sent.
 */
export function flagsOf<K extends string>(
  args: unknown,
  field: string,
  keys: readonly K[],
): Partial<Record<K, boolean>> | undefined | Error {
  const given =
    args !== null && typeof args === 'object'
      ? fieldOf(args, field)
      : undefined;
  if (given === undefined) return undefined;
  if (given === null || typeof given !== 'object') {
    return new Error(`${field} must be an object; nothing was sent`);
  }
  const flags: Partial<Record<K, boolean>> = {};
  for (const key of keys) {
    const value = fieldOf(given, key);
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      return new Error(
        `${field}.${key} must be true or false; nothing was sent`,
      );
    }
    flags[key] = value;
  }
  return flags;
}

/** The run's flags `args` names — scope, risk levels, durations — checked; an `Error` for the first that is not. */
export function runFlagsOf(args: unknown) {
  const scope = flagsOf(args, 'scope', [
    'own_tests',
    'foreign_tests',
    'add_foreign_tests_as_preview',
  ]);
  if (scope instanceof Error) return scope;
  const riskLevel = flagsOf(args, 'risk_level', [
    'harmless',
    'dangerous',
    'critical',
  ]);
  if (riskLevel instanceof Error) return riskLevel;
  const duration = flagsOf(args, 'duration', ['short', 'medium', 'long']);
  if (duration instanceof Error) return duration;
  return { scope, riskLevel, duration };
}
