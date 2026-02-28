/**
 * CreateUnitTest Handler - Start ABAP Unit test run via AdtClient
 *
 * Uses AdtClient.getUnitTest().create() for high-level test run operation.
 * Starts unit test execution and returns run_id for status/result queries.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateUnitTest',
  description:
    'Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.',
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
 * Uses AdtClient.getUnitTest().create() - high-level test run operation
 */
export async function handleCreateUnitTest(
  context: HandlerContext,
  args: CreateUnitTestArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      tests,
      title,
      context: contextStr,
      scope,
      risk_level,
      duration,
    } = args as CreateUnitTestArgs;

    // Validation
    if (!Array.isArray(tests) || tests.length === 0) {
      return return_error(
        new Error('tests array with at least one entry is required'),
      );
    }

    const formattedTests = tests.map((test) => ({
      containerClass: test.container_class.toUpperCase(),
      testClass: test.test_class.toUpperCase(),
    }));

    const client = createAdtClient(connection, logger);
    const unitTest = client.getUnitTest();

    logger?.info(
      `Starting ABAP Unit run for ${formattedTests.length} test definition(s)`,
    );

    try {
      const createResult = await unitTest.create({
        tests: formattedTests,
        options: {
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
        },
      });

      if (!createResult.runId) {
        throw new Error('Failed to start unit test run: run_id not returned');
      }

      logger?.info(`✅ CreateUnitTest started. Run ID: ${createResult.runId}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            run_id: createResult.runId,
            message: `ABAP Unit run started. Use GetUnitTest with run_id ${createResult.runId} to get status and results.`,
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
