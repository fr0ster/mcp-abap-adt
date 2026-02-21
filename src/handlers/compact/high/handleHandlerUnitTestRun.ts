import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleRunUnitTest } from '../../unit_test/high/handleRunUnitTest';
import { compactUnitTestRunSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestRun',
  description: 'Compact ABAP Unit run. Starts a test run and returns run_id.',
  inputSchema: compactUnitTestRunSchema,
} as const;

type HandlerUnitTestRunArgs = {
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
};

export async function handleHandlerUnitTestRun(
  context: HandlerContext,
  args: HandlerUnitTestRunArgs,
) {
  return handleRunUnitTest(context, args);
}

