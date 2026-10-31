import { compactUnitTestRunSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleStartUnitTestRun,
  type UnitTestRunner,
} from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestRun',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'ABAP Unit test run, for exactly one of tests and target. tests[]{container_class*, test_class*}: chosen local test classes of global classes. target: all tests of one object of any run object type — { kind: object, name, type }, e.g. CLAS/OC a class, PROG/P a report, FUGR/F a function group, DDLS/DF a CDS view (its tests run with scope.foreign_tests true) — or of a package — { kind: package, name, include_subpackages }. Optional: runner (async | sync, default async; sync with tests only), title, context, scope, risk_level, duration. Response: JSON — runner async (tests or target): { success, run_id }, the status and result read later by run_id, suited to long suites; runner sync: { success, runner, finished, run_result }, the finished result of every test class of each container_class in one request.',
  inputSchema: compactUnitTestRunSchema,
} as const;

type HandlerUnitTestRunArgs = {
  tests?: Array<{
    container_class: string;
    test_class: string;
  }>;
  target?: {
    kind: 'object' | 'package';
    name: string;
    type?: string;
    include_subpackages?: boolean;
  };
  title?: string;
  context?: string;
  scope?: {
    own_tests?: boolean;
    foreign_tests?: boolean;
    add_foreign_tests_as_preview?: boolean;
  };
  risk_level?: {
    harmless?: boolean;
    dangerous?: boolean;
    critical?: boolean;
  };
  duration?: {
    short?: boolean;
    medium?: boolean;
    long?: boolean;
  };
  runner?: UnitTestRunner;
};

export async function handleHandlerUnitTestRun(
  context: HandlerContext,
  args: HandlerUnitTestRunArgs,
) {
  return handleStartUnitTestRun(context, args);
}
