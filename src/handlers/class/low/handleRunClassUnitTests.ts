/**
 * RunClassUnitTests Handler - Start ABAP Unit run for class-based tests
 *
 * Uses AdtClient.runClassUnitTests from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 *
 * **Deliberately excluded from Task 14's `class/low` migration.** This
 * reaches `getUnitTest()`, not `getClass()` — a different family with its
 * own result set (`ourUnitTest`, already exported from `resultSets.ts`) and
 * its own `analyseUnitTest` strategy — and stays on `client.getUnitTest() as
 * any` until the task that wires the unit-test members migrates it. It has
 * no `tsc` error today only because nothing here resolves a signature that
 * names `IAdtResponse`'s type parameters explicitly, not because it is
 * migrated.
 *
 * **Two things adt-clients 23 took away, and where they come from now.**
 * `run()` no longer judges its own answer, so `analyseUnitTestStart` — the same
 * reading, under its own name in `@mcp-abap-adt/adt-strategies` — is passed
 * here: an answer that names no run is a refusal, not a run with an empty id.
 * And the client remembers nothing, so `getStatusResponse()` is gone with
 * `getRunId`; because this call goes through an `as any`, its `?.` simply
 * answered `undefined` and this tool's `status_code` and `location` would have
 * quietly emptied. They are read off the wire by the result strategy below
 * instead — the shape a caller gets is the shape the strategy answers, and
 * this one answers the id with those two facts beside it.
 */

import { unitTestDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseUnitTestStart,
  unitTestRunId,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

/**
 * The run id, with the two wire facts this tool has always answered beside it.
 *
 * `unitTestRunId` is the library's own reading of where the id lives — the
 * `Location`, `Content-Location` or `sap-adt-location` header, or
 * `aunit:run@uri` — and it is called rather than reimplemented. The status and
 * the location are taken from the same answer, because the client no longer
 * keeps a wire response to ask afterwards.
 */
const runIdWithWire = (answer: IAdtWireResponse) => ({
  runId: unitTestRunId(answer) as unknown as string,
  status: Number((answer as { status?: unknown }).status ?? 0),
  location:
    answer.headers?.location ??
    answer.headers?.Location ??
    (answer.headers?.['content-location'] as string | undefined) ??
    null,
});

type ScopeOptions = {
  ownTests?: boolean;
  foreignTests?: boolean;
  addForeignTestsAsPreview?: boolean;
};

type RiskOptions = {
  harmless?: boolean;
  dangerous?: boolean;
  critical?: boolean;
};

type DurationOptions = {
  short?: boolean;
  medium?: boolean;
  long?: boolean;
};

export const TOOL_DEFINITION = {
  name: 'RunClassUnitTestsLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.',
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
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['tests'],
  },
} as const;

interface TestDefinitionInput {
  container_class: string;
  test_class: string;
}

interface RunClassUnitTestsArgs {
  tests: TestDefinitionInput[];
  title?: string;
  context?: string;
  scope?: {
    own_tests?: boolean;
    foreign_tests?: boolean;
    add_foreign_tests_as_preview?: boolean;
  };
  risk_level?: RiskOptions;
  duration?: DurationOptions;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleRunClassUnitTests(
  context: HandlerContext,
  args: RunClassUnitTestsArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      tests,
      title,
      context,
      scope,
      risk_level,
      duration,
      session_id,
      session_state,
    } = args as RunClassUnitTestsArgs;

    if (!Array.isArray(tests) || tests.length === 0) {
      return return_error(
        new Error('tests array with at least one entry is required'),
      );
    }

    const formattedTests = tests.map((test, index) => {
      if (!test?.container_class || !test?.test_class) {
        throw new Error(
          `tests[${index}] must include container_class and test_class`,
        );
      }
      return {
        containerClass: test.container_class.toUpperCase(),
        testClass: test.test_class.toUpperCase(),
      };
    });

    const client = createAdtClient(connection, logger);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
    }

    const mappedScope: ScopeOptions | undefined = scope
      ? {
          ownTests: scope.own_tests,
          foreignTests: scope.foreign_tests,
          addForeignTestsAsPreview: scope.add_foreign_tests_as_preview,
        }
      : undefined;

    const options = {
      title,
      context,
      scope: mappedScope,
      riskLevel: risk_level,
      duration,
    };

    logger?.info(
      `Starting ABAP Unit run for ${formattedTests.length} definitions`,
    );

    try {
      const unitTest = client.getUnitTest({
        ...unitTestDocuments,
        run: runIdWithWire,
      }) as any;
      // `run()` answers an `IAdtResponse`, not the run id directly — treating
      // the envelope itself as the id (the pre-fix shape here) serialises an
      // object with only an `ok` field (its methods are not JSON), and
      // `!envelope` never fires because both a success and a refusal
      // envelope are truthy objects. That is the false-success shape this
      // migration exists to remove, on the tool that starts the run.
      const runAnswer = await unitTest.run(formattedTests, {
        ...options,
        analyse: analyseUnitTestStart,
      });

      if (!runAnswer?.ok) {
        const failure = runAnswer?.getError?.();
        throw new Error(
          failure?.message ??
            'Failed to obtain ABAP Unit run identifier from SAP response headers',
        );
      }

      const started = runAnswer.getResult().value as ReturnType<
        typeof runIdWithWire
      >;
      const runId = started.runId;
      if (!runId) {
        throw new Error(
          'Failed to obtain ABAP Unit run identifier from SAP response headers',
        );
      }

      logger?.info(`✅ RunClassUnitTests started. Run ID: ${runId}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id: runId,
            status_code: started.status,
            location: started.location,
            session_id: session_id || null,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `ABAP Unit run started. Use GetClassUnitTestStatusLow and GetClassUnitTestResultLow with run_id ${runId}.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`Error starting ABAP Unit run: ${error?.message || error}`);
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
