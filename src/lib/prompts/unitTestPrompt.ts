/**
 * The unit_test prompt: the ABAP Unit run of an object or a package — one
 * call on the full set, the result read by run id when the call answers
 * one; on compact the run, its status until it is finished, and its result.
 */
import type { AbapUnitRunObjectType } from '@mcp-abap-adt/interfaces-adt';
import { TOOL_DEFINITION as RunAbapUnit } from '../../handlers/unit_test/high/handleRunAbapUnit.js';
import { TOOL_DEFINITION as RunFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest.js';
import { TOOL_DEFINITION as RunFunctionModuleUnitTest } from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest.js';
import { TOOL_DEFINITION as RunProgramUnitTest } from '../../handlers/unit_test/high/handleRunProgramUnitTest.js';
import { TOOL_DEFINITION as RunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest.js';
import type { RunTargetArgs } from '../../handlers/unit_test/shared/runTarget.js';
import type { JsonValue } from '../json.js';
import { askValue } from './askValue.js';
import { closedOptionalArgument } from './completion.js';
import { jsonLiteral } from './instruction.js';
import { objectArguments, stepValue, userValue } from './objectPrompts.js';
import { type FullRow, fullRow } from './objectRows.js';
import { promptRefusal, requiredWords } from './refusals.js';
import { matchServed, requiredArgument } from './served.js';
import { toolStep } from './source.js';
import type {
  AbapPrompt,
  ListedPromptTool,
  PromptInstruction,
  PromptSource,
  PromptStep,
} from './types.js';

/** The object types a unit-test run names by a run object type. */
export type UnitTestType =
  | 'CLASS'
  | 'PROGRAM'
  | 'FUNCTION_GROUP'
  | 'FUNCTION_MODULE'
  | 'DDL';

/** The run object type of each object type, as the run's `target.type` takes it. */
export const RUN_TARGET: Record<UnitTestType, AbapUnitRunObjectType> = {
  CLASS: 'CLAS/OC',
  PROGRAM: 'PROG/P',
  FUNCTION_GROUP: 'FUGR/F',
  FUNCTION_MODULE: 'FUNC',
  DDL: 'DDLS/DF',
};

/** The types the prompt serves: the object types and a package. */
type RunType = UnitTestType | 'PACKAGE';

/** The types in the order they are offered. */
const RUN_TYPES: readonly RunType[] = [
  'CLASS',
  'PROGRAM',
  'FUNCTION_GROUP',
  'FUNCTION_MODULE',
  'DDL',
  'PACKAGE',
];

/** The full set's per-type run tools, each named by its name argument. */
const PER_TYPE_RUNS: Partial<Record<RunType, FullRow>> = {
  CLASS: fullRow(RunUnitTest, 'class_name'),
  PROGRAM: fullRow(RunProgramUnitTest, 'program_name'),
  FUNCTION_GROUP: fullRow(RunFunctionGroupUnitTest, 'function_group_name'),
  FUNCTION_MODULE: fullRow(RunFunctionModuleUnitTest, 'function_module_name'),
};

const INCLUDE_SUBPACKAGES_WORDS =
  'For a package, whether the tests of its subpackages run too';

/** What a package's run still to fill says of `include_subpackages`: the instruction's own words, kept apart from the argument's description. */
const INCLUDE_SUBPACKAGES_TO_FILL =
  'For a package: true runs the tests of its subpackages too.';

/** The values `include_subpackages` takes. */
const INCLUDE_SUBPACKAGES_VALUES: readonly string[] = ['true', 'false'];

/** The run target of `type` named `name`; a package's subpackages as given. */
function targetOf(
  type: RunType,
  name: string,
  includeSubpackages: boolean | undefined,
): JsonValue {
  if (type !== 'PACKAGE') {
    const target = {
      kind: 'object',
      name,
      type: RUN_TARGET[type],
    } satisfies RunTargetArgs;
    return target;
  }
  if (includeSubpackages === undefined) {
    const target = { kind: 'package', name } satisfies RunTargetArgs;
    return target;
  }
  const target = {
    kind: 'package',
    name,
    include_subpackages: includeSubpackages,
  } satisfies RunTargetArgs;
  return target;
}

/** The target-run arguments: the target, and the foreign tests of a CDS view. */
function targetArguments(
  type: RunType,
  name: string,
  includeSubpackages: boolean | undefined,
): readonly (readonly [string, ReturnType<typeof userValue>])[] {
  return [
    ['target', userValue(targetOf(type, name, includeSubpackages))],
    ...(type === 'DDL'
      ? [['scope', userValue({ foreign_tests: true })] as const]
      : []),
  ];
}

/** How a served type is run: the steps for its name and the subpackages flag. */
interface RunRow {
  readonly type: RunType;
  readonly steps: (
    name: string,
    includeSubpackages: boolean | undefined,
  ) => readonly PromptStep[];
}

/** The full set's row of `type`, when its run tool is listed. */
function fullRunRow(source: PromptSource, type: RunType): RunRow | undefined {
  const perType = PER_TYPE_RUNS[type];
  const runName = perType?.tool ?? RunAbapUnit.name;
  const run = source.tools.get(runName);
  if (run === undefined) return undefined;
  const result = source.tools.get('GetUnitTestResult');
  return {
    type,
    steps: (name, includeSubpackages) => [
      toolStep(
        run,
        perType === undefined
          ? targetArguments(type, name, includeSubpackages)
          : [[perType.name, userValue(name)]],
      ),
      ...(result === undefined
        ? []
        : [
            toolStep(result, [['run_id', stepValue(1, 'run_id')]], {
              condition: 'When it answers a run_id without a run_result',
            }),
          ]),
    ],
  };
}

/** The compact tools of a run, when all three are listed. */
interface CompactRunTools {
  readonly run: ListedPromptTool;
  readonly status: ListedPromptTool;
  readonly result: ListedPromptTool;
}

/** The compact row of `type`: run, one long-polled status read, the result when it is FINISHED. */
function compactRunRow(tools: CompactRunTools, type: RunType): RunRow {
  return {
    type,
    steps: (name, includeSubpackages) => [
      toolStep(tools.run, targetArguments(type, name, includeSubpackages), {
        keeps: ['run_id'],
      }),
      toolStep(
        tools.status,
        [
          ['run_id', stepValue(1, 'run_id')],
          ['with_long_polling', userValue(true)],
        ],
        { keeps: ['status'] },
      ),
      toolStep(tools.result, [['run_id', stepValue(1, 'run_id')]], {
        condition: 'When the status is FINISHED',
        note: 'For any other status, answer the user with the run_id and the status SAP named, so the user can ask again.',
      }),
    ],
  };
}

/** The compact run tools, when all three are listed. */
function compactRunTools(source: PromptSource): CompactRunTools | undefined {
  const run = source.tools.get('HandlerUnitTestRun');
  const status = source.tools.get('HandlerUnitTestStatus');
  const result = source.tools.get('HandlerUnitTestResult');
  return run === undefined || status === undefined || result === undefined
    ? undefined
    : { run, status, result };
}

/** The served rows: the full set's where its tool is listed, else compact's. */
function runRows(source: PromptSource): readonly RunRow[] {
  const compact = compactRunTools(source);
  return RUN_TYPES.flatMap((type) => {
    const row =
      fullRunRow(source, type) ??
      (compact === undefined ? undefined : compactRunRow(compact, type));
    return row === undefined ? [] : [row];
  });
}

/** `include_subpackages` as given: `true`, `false`, or absent. */
function subpackagesOf(
  given: string | undefined,
  type: RunType,
): boolean | undefined {
  if (given === undefined) return undefined;
  if (type !== 'PACKAGE') {
    throw promptRefusal('unit_test: include_subpackages is read for package');
  }
  if (given === 'true') return true;
  if (given === 'false') return false;
  throw promptRefusal('unit_test: include_subpackages is true or false.');
}

/**
 * What SAP runs for a function module: the run names the module, and SAP
 * runs the tests of the function group holding it.
 */
const FUNCTION_MODULE_RUN_WORDS =
  "A run of a function module runs the ABAP Unit tests of the module's whole function group.";

/** `unit_test`: the ABAP Unit run of an object or a package. */
export function unitTestPrompt(source: PromptSource): AbapPrompt | undefined {
  const rows = runRows(source);
  if (rows.length === 0) return undefined;
  const served = rows.map(({ type }) => type.toLowerCase());
  const byLowercase = new Map(
    rows.map((row) => [row.type.toLowerCase(), row.type]),
  );
  return {
    name: 'unit_test',
    description:
      'Runs the ABAP Unit tests of the object of object_type named name, or of a package, and reads the result.',
    argsSchema: {
      // A run names a function module by its own name: SAP finds its
      // function group and runs that group's tests, so no group is declared.
      ...objectArguments(served, []),
      include_subpackages: closedOptionalArgument(
        INCLUDE_SUBPACKAGES_WORDS,
        INCLUDE_SUBPACKAGES_VALUES,
      ),
    },
    instruction: (args): PromptInstruction => {
      const objectType = requiredArgument(args, 'object_type');
      const type =
        objectType === undefined
          ? undefined
          : matchServed(objectType, byLowercase);
      const row = rows.find((each) => each.type === type);
      if (row === undefined) {
        return askValue('unit_test', 'object_type', objectType, served);
      }
      const name = requiredArgument(args, 'name');
      if (name === undefined) {
        throw promptRefusal(requiredWords('unit_test', 'name'));
      }
      const includeSubpackages = subpackagesOf(
        requiredArgument(args, 'include_subpackages'),
        row.type,
      );
      const steps = row.steps(name, includeSubpackages);
      const [first, ...rest] = steps;
      const stillToFill =
        row.type === 'PACKAGE' &&
        includeSubpackages === undefined &&
        first !== undefined
          ? [
              {
                ...first,
                stillToFill: [
                  ...first.stillToFill,
                  {
                    name: 'include_subpackages',
                    description: INCLUDE_SUBPACKAGES_TO_FILL,
                  },
                ],
              },
              ...rest,
            ]
          : steps;
      return {
        headline:
          row.type === 'FUNCTION_MODULE'
            ? `Run the ABAP Unit tests of the whole function group of the FUNCTION_MODULE ${jsonLiteral(name)}.`
            : `Run the unit tests of the ${row.type} ${jsonLiteral(name)}.`,
        steps: stillToFill,
        notes:
          row.type === 'FUNCTION_MODULE' ? [FUNCTION_MODULE_RUN_WORDS] : [],
      };
    },
  };
}
