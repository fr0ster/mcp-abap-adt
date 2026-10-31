/**
 * RunAbapUnit — run ABAP Unit by a run target (`AbapUnitRunTarget` of
 * interfaces-adt): one object of any type the run registry
 * (`ABAP_UNIT_RUN_TYPES`) lists, or one package. Through adt-clients'
 * generic runner (`AdtExecutor.getAbapUnitTestRunner`): the run is started on
 * `POST /abapunit/runs`, waited for within a bound and its result answered,
 * as the per-object run tools do (`runTests.ts`).
 *
 * The endpoint answers a type it does not run with an empty result, not a
 * refusal (adt-clients' measurements), so the type is checked here, against
 * the registry's keys, before anything is sent.
 *
 * A CDS view's tests are assigned tests (the registry's `runs:
 * 'assignedTests'`): local test classes marked `"! @testing <view>`. They
 * execute only when the scope sets `foreignTests`; with the default scope the
 * result lists them as a preview, unexecuted (measured by adt-clients on
 * S/4HANA 2025 and ABAP cloud).
 *
 * A test run executes code that can change data in the system, so the tool
 * is in the high group with the per-object run tools, and no read-only
 * binary serves it. SAP_BASIS 7.40 has no `/abapunit/runs`: `available_in` leaves `legacy` out.
 */

import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import {
  ABAP_UNIT_RUN_TYPES,
  type AbapUnitRunObjectType,
  type AbapUnitRunTarget,
} from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { scopeOf } from '../shared/runner';
import { projectRun, waitForRun } from '../shared/runTests';

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

export const TOOL_DEFINITION = {
  name: 'RunAbapUnit',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the run target named by target and returns the result. target.kind object: the tests of the object named by target.name, of the run object type target.type (CLAS/OC a class, CLAS/OCL its test class include, PROG/P a program, FUGR/F a function group, FUNC a function module, DDLS/DF a CDS view, among the listed types). target.kind package: the tests of the package named by target.name, its subpackages too when target.include_subpackages is true. A CDS view has assigned tests: test classes elsewhere marked "! @testing <view>"; they execute when scope.foreign_tests is true, and with the default scope the result lists them as a preview, unexecuted. The run is started and waited for within a bound; a run that outlasts it returns its run_id, whose status and result are read by run_id.',
  inputSchema: {
    type: 'object',
    properties: {
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
      scope: {
        type: 'object',
        description:
          'Which tests the run covers. Assigned tests are test classes linked to the object by an ABAP Doc @testing relation (the tests of a CDS view are such).',
        properties: {
          own_tests: {
            type: 'boolean',
            description: "Run the object's own tests (default true).",
          },
          foreign_tests: {
            type: 'boolean',
            description:
              'Execute the assigned tests (default false); a CDS view run sets it true.',
          },
          add_foreign_tests_as_preview: {
            type: 'boolean',
            description:
              'List the assigned tests as a preview, unexecuted (default true).',
          },
        },
      },
      risk_level: {
        type: 'object',
        description: 'Risk levels the run accepts.',
        properties: {
          harmless: {
            type: 'boolean',
            description: 'Run harmless tests (default true).',
          },
          dangerous: {
            type: 'boolean',
            description: 'Run dangerous tests (default true).',
          },
          critical: {
            type: 'boolean',
            description: 'Run critical tests (default true).',
          },
        },
      },
      duration: {
        type: 'object',
        description: 'Durations the run accepts.',
        properties: {
          short: {
            type: 'boolean',
            description: 'Run short tests (default true).',
          },
          medium: {
            type: 'boolean',
            description: 'Run medium tests (default true).',
          },
          long: {
            type: 'boolean',
            description: 'Run long tests (default true).',
          },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['target'],
  },
} as const;

/** A field of a caller's object, as given. */
function fieldOf(given: object, field: string): unknown {
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
function flagsOf<K extends string>(
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

export async function handleRunAbapUnit(
  context: HandlerContext,
  args: unknown,
) {
  const target = runTargetOf(
    args !== null && typeof args === 'object'
      ? fieldOf(args, 'target')
      : undefined,
  );
  if (target instanceof Error) return return_error(target);
  const scope = flagsOf(args, 'scope', [
    'own_tests',
    'foreign_tests',
    'add_foreign_tests_as_preview',
  ]);
  if (scope instanceof Error) return return_error(scope);
  const riskLevel = flagsOf(args, 'risk_level', [
    'harmless',
    'dangerous',
    'critical',
  ]);
  if (riskLevel instanceof Error) return return_error(riskLevel);
  const duration = flagsOf(args, 'duration', ['short', 'medium', 'long']);
  if (duration instanceof Error) return return_error(duration);
  const detail = detailOf(args);
  const runner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getAbapUnitTestRunner(ourUnitTest);
  return answer(
    { tool: 'RunAbapUnit', detail },
    () =>
      waitForRun(runner, () =>
        runner.run(target, {
          scope: scopeOf(scope),
          riskLevel,
          duration,
          // A run SAP did not start is a failure (see adt-clients' migration guide to 23).
          analyse: analyseUnitTestStart,
        }),
      ),
    projectRun(detail),
  );
}
