/**
 * RunClassUnitTests Handler - Start ABAP Unit run for class-based tests
 *
 * Uses CrudClient.runClassUnitTests from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse, return_error, return_response, logger as baseLogger, restoreSessionInConnection } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

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
  name: "RunClassUnitTestsLow",
  description: "[low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.",
  inputSchema: {
    type: "object",
    properties: {
      tests: {
        type: "array",
        description: "List of container/test class pairs to execute.",
        items: {
          type: "object",
          properties: {
            container_class: { type: "string", description: "Class that owns the test include (e.g., ZCL_MAIN_CLASS)." },
            test_class: { type: "string", description: "Test class name inside the include (e.g., LTCL_MAIN_CLASS)." }
          },
          required: ["container_class", "test_class"]
        }
      },
      title: {
        type: "string",
        description: "Optional title for the ABAP Unit run."
      },
      context: {
        type: "string",
        description: "Optional context string shown in SAP tools."
      },
      scope: {
        type: "object",
        properties: {
          own_tests: { type: "boolean" },
          foreign_tests: { type: "boolean" },
          add_foreign_tests_as_preview: { type: "boolean" }
        }
      },
      risk_level: {
        type: "object",
        properties: {
          harmless: { type: "boolean" },
          dangerous: { type: "boolean" },
          critical: { type: "boolean" }
        }
      },
      duration: {
        type: "object",
        properties: {
          short: { type: "boolean" },
          medium: { type: "boolean" },
          long: { type: "boolean" }
        }
      },
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["tests"]
  }
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

export async function handleRunClassUnitTests(connection: AbapConnection, args: RunClassUnitTestsArgs) {
  try {
    const {
      tests,
      title,
      context,
      scope,
      risk_level,
      duration,
      session_id,
      session_state
    } = args as RunClassUnitTestsArgs;

    if (!Array.isArray(tests) || tests.length === 0) {
      return return_error(new Error('tests array with at least one entry is required'));
    }

    const formattedTests = tests.map((test, index) => {
      if (!test?.container_class || !test?.test_class) {
        throw new Error(`tests[${index}] must include container_class and test_class`);
      }
      return {
        containerClass: test.container_class.toUpperCase(),
        testClass: test.test_class.toUpperCase()
      };
    });

    const handlerLogger = getHandlerLogger(
      'handleRunClassUnitTests',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    const mappedScope: ScopeOptions | undefined = scope
      ? {
        ownTests: scope.own_tests,
        foreignTests: scope.foreign_tests,
        addForeignTestsAsPreview: scope.add_foreign_tests_as_preview
      }
      : undefined;

    const options = {
      title,
      context,
      scope: mappedScope,
      riskLevel: risk_level,
      duration
    };

    handlerLogger.info(`Starting ABAP Unit run for ${formattedTests.length} definitions`);

    try {
      await client.runClassUnitTests(formattedTests, options);
      const runResponse = client.getAbapUnitRunResponse();
      const runId = client.getAbapUnitRunId();


      if (!runId) {
        throw new Error('Failed to obtain ABAP Unit run identifier from SAP response headers');
      }

      handlerLogger.info(`✅ RunClassUnitTests started. Run ID: ${runId}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          run_id: runId,
          status_code: runResponse?.status,
          location: runResponse?.headers?.['location'] || runResponse?.headers?.['content-location'] || null,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: `ABAP Unit run started. Use GetClassUnitTestStatusLow and GetClassUnitTestResultLow with run_id ${runId}.`
        }, null, 2)
      } as AxiosResponse);
    } catch (error: any) {
      handlerLogger.error(`Error starting ABAP Unit run: ${error?.message || error}`);
      return return_error(new Error(error?.message || String(error)));
    }
  } catch (error: any) {
    return return_error(error);
  }
}

