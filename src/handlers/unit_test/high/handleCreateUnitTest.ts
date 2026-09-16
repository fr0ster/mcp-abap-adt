/**
 * CreateUnitTest Handler - Start ABAP Unit test run via AdtClient
 *
 * Uses AdtClient.getUnitTest().run() for high-level test run operation.
 * Starts unit test execution and returns run_id for status/result queries.
 *
 * **`create` no longer starts a run.** `AdtUnitTest`'s own doc comment: "Two
 * different things, and until 12.0.0 they shared one method: `create` meant
 * 'start a run'". The pre-migration handler here called `unitTest.create({
 * tests, options })`, which was already the pre-12.0.0 shape — in v19
 * `create()` posts the *container class* (`Omit<IUnitTestConfig,
 * 'sourceCode'>`, no `tests` field at all) and answers no `runId`.
 *
 * What this tool always promised — start a run for named container/test
 * class pairs, answer its id — is `AdtUnitTest.run(tests, options)`:
 * "Needs no `create` and no `update`: the tests may have been in the class
 * for years." Its argument shapes, `IClassUnitTestDefinition[]`
 * (`containerClass`/`testClass`) and `IClassUnitTestRunOptions`
 * (`title`/`context`/`scope`/`riskLevel`/`duration`), are exactly what this
 * handler already built — a rename, not a redesign, and the tool's frozen
 * `required: ['tests']` describes `run`'s own signature precisely.
 *
 * `run` takes no `options.analyse` — confirmed against the shipped
 * `AdtUnitTest.d.ts`/`.js`: `IClassUnitTestRunOptions` carries no operation
 * options, and `run()`'s body always judges the answer with its own
 * `startedRun` (an `ADT_NO_FAILURE` verdict flips to a refusal only when the
 * body/headers carry no run id at all — never something this handler could
 * override). The verdict on whether a run started stays the library's.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries. ' +
    'On legacy systems (BASIS < 7.50) the run finishes synchronously inside this call, but run_id is a fixed ' +
    'placeholder, not a real identifier — a later GetUnitTest/GetUnitTestStatus/GetUnitTestResult call is served ' +
    'by a fresh client with no memory of this run and always refuses, whatever the outcome was (issue #208).',
  inputSchema: {
    type: 'object',
    properties: {
      tests: {
        type: 'array',
        description: 'List of container/test class pairs to execute.',
        items: {
          type: 'object',
          properties: {
            container_class: {
              type: 'string',
              description:
                'Class that owns the test include (e.g., ZCL_MAIN_CLASS).',
            },
            test_class: {
              type: 'string',
              description:
                'Test class name inside the include (e.g., LTCL_MAIN_CLASS).',
            },
          },
          required: ['container_class', 'test_class'],
        },
      },
      title: {
        type: 'string',
        description: 'Optional title for the ABAP Unit run.',
      },
      context: {
        type: 'string',
        description: 'Optional context string shown in SAP tools.',
      },
      scope: {
        type: 'object',
        properties: {
          own_tests: { type: 'boolean' },
          foreign_tests: { type: 'boolean' },
          add_foreign_tests_as_preview: { type: 'boolean' },
        },
      },
      risk_level: {
        type: 'object',
        properties: {
          harmless: { type: 'boolean' },
          dangerous: { type: 'boolean' },
          critical: { type: 'boolean' },
        },
      },
      duration: {
        type: 'object',
        properties: {
          short: { type: 'boolean' },
          medium: { type: 'boolean' },
          long: { type: 'boolean' },
        },
      },
    },
    required: ['tests'],
  },
} as const;

interface CreateUnitTestArgs {
  tests: Array<{
    container_class: string;
    test_class: string;
  }>;
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
}

/**
 * Main handler for CreateUnitTest MCP tool
 *
 * Uses AdtClient.getUnitTest().run() - starts a run for named test pairs.
 */
export async function handleCreateUnitTest(
  context: HandlerContext,
  args: CreateUnitTestArgs,
) {
  const { connection, logger } = context;
  const {
    tests,
    title,
    context: contextStr,
    scope,
    risk_level,
    duration,
  } = args as CreateUnitTestArgs;

  if (!Array.isArray(tests) || tests.length === 0) {
    return return_error(
      new Error('tests array with at least one entry is required'),
    );
  }

  const formattedTests = tests.map((test) => ({
    containerClass: test.container_class.toUpperCase(),
    testClass: test.test_class.toUpperCase(),
  }));

  logger?.info(
    `Starting ABAP Unit run for ${formattedTests.length} test definition(s)`,
  );

  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);

  return answer(
    { tool: 'CreateUnitTest', detail: 'terse' },
    () =>
      unitTest.run(formattedTests, {
        title,
        context: contextStr,
        scope: scope
          ? {
              ownTests: scope.own_tests,
              foreignTests: scope.foreign_tests,
              addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
            }
          : undefined,
        riskLevel: risk_level,
        duration,
      }),
    (runId: string) => ({
      success: true,
      run_id: runId,
      message: `ABAP Unit run started. Use GetUnitTest with run_id ${runId} to get status and results.`,
    }),
  );
}
