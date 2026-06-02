/**
 * RunAbapUnit Handler - Run ABAP Unit tests for an object synchronously
 *
 * Posts to /sap/bc/adt/abapunit/testruns and returns the full result in one
 * call (no run_id polling). Unlike RunUnitTest (async /runs flow, which fails
 * on 7.5x backends), this uses the object-based /testruns endpoint that Eclipse
 * ADT uses for "Run As → ABAP Unit Test" and returns a parsed pass/fail summary.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RunAbapUnit',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Run ABAP Unit tests for a single ABAP object synchronously and return a ' +
    'pass/fail summary plus failure details. Supports classes, programs, ' +
    'function groups, includes, and packages. Uses the /testruns endpoint ' +
    '(full result in one response, no polling) — prefer this over RunUnitTest ' +
    'on 7.5x backends. Use test_scope to include foreign (assigned) tests.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Name of the ABAP object to test (e.g., "ZCL_MY_CLASS").',
      },
      object_type: {
        type: 'string',
        enum: ['class', 'program', 'function_group', 'include', 'package'],
        description:
          'Type of object to test. Use "package" to run all tests in a package.',
      },
      test_scope: {
        type: 'string',
        enum: ['own_tests', 'foreign_tests', 'all_tests'],
        description:
          'Scope of test discovery: "own_tests" (default, tests in the same ' +
          'program), "foreign_tests" (external classes assigned via ' +
          'TAUNIT_TEST_REL), or "all_tests" (both).',
        default: 'own_tests',
      },
      with_coverage: {
        type: 'boolean',
        description: 'Include code coverage measurement (default: false).',
        default: false,
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface RunAbapUnitArgs {
  object_name: string;
  object_type: 'class' | 'program' | 'function_group' | 'include' | 'package';
  test_scope?: 'own_tests' | 'foreign_tests' | 'all_tests';
  with_coverage?: boolean;
}

export async function handleRunAbapUnit(
  context: HandlerContext,
  args: RunAbapUnitArgs,
) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, test_scope, with_coverage } =
      args as RunAbapUnitArgs;

    if (!object_name) {
      return return_error(new Error('object_name is required'));
    }
    if (!object_type) {
      return return_error(new Error('object_type is required'));
    }

    const client = createAdtClient(connection, logger);
    const runner = client.getUnitTestRunner();

    logger?.info(
      `Running ABAP Unit for ${object_type} ${object_name.toUpperCase()}` +
        (test_scope && test_scope !== 'own_tests'
          ? ` (scope: ${test_scope})`
          : ''),
    );

    try {
      const { summary, raw } = await runner.runSync(object_type, object_name, {
        testScope: test_scope,
        withCoverage: with_coverage,
      });

      const allGreen = summary.failed === 0 && summary.errors === 0;
      const failures = summary.methods.filter((m) => m.status !== 'passed');

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            object: object_name.toUpperCase(),
            object_type,
            verdict: allGreen ? 'green' : 'red',
            total: summary.total,
            passed: summary.passed,
            failed: summary.failed,
            errors: summary.errors,
            failures: failures.map((m) => ({
              test_class: m.testClass,
              test_method: m.name,
              status: m.status,
              alerts: m.alerts.map((a) => ({
                kind: a.kind,
                severity: a.severity,
                title: a.title,
              })),
            })),
            message: allGreen
              ? `All ${summary.total} test(s) passed.`
              : `${summary.failed} failed, ${summary.errors} error(s) of ${summary.total} test(s).`,
            // Truncated raw result for context; omitted when there are no failures.
            raw_excerpt: allGreen ? undefined : raw.slice(0, 4000),
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: unknown) {
      const err = error as Error;
      logger?.error(
        `Error running ABAP Unit: ${err?.message ?? String(error)}`,
      );
      return return_error(new Error(err?.message ?? String(error)));
    }
  } catch (error: unknown) {
    return return_error(error as Error);
  }
}
