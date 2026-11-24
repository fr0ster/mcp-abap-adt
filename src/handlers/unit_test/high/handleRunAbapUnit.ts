import * as z from 'zod';
import { wireAnswer } from '../../../lib/detail';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { WAIT_FIELD } from '../shared/runner';
import { RUN_TARGET_FIELD } from '../shared/runTarget';
/**
 * RunAbapUnit — run ABAP Unit by a run target (`AbapUnitRunTarget` of
 * interfaces-adt): one object of any type the run registry
 * (`ABAP_UNIT_RUN_TYPES`) lists, or one package. Through adt-clients'
 * generic runner (`AdtExecutor.getAbapUnitTestRunner`): the run is started on
 * `POST /abapunit/runs` and, with `wait` (the default), its status read at
 * once and long-polled while SAP answers it running or, on that first read,
 * not started (`readStartedRun`) — the result of a run SAP answers finished,
 * the run id and SAP's status for one a long-polled read answers not
 * started — as the per-object run tools do
 * (`runTests.ts`); with `wait: false` the run id is answered at once.
 *
 * The endpoint answers a type it does not run with an empty result, not a
 * refusal (adt-clients' measurements), so the type is checked before anything
 * is sent (`runTarget.ts`, shared with compact `HandlerUnitTestRun`).
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
import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { unitTestRun } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { scopeOf, waitOf } from '../shared/runner';
import { runFlagsOf, runTargetOf } from '../shared/runTarget';
import { projectRun, waitForRun } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunAbapUnit',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRun(
      "the ABAP Unit tests of a class, report, function group, function module's group, CDS view, package",
    ),
  ),
  inputSchema: z.object({
    target: RUN_TARGET_FIELD,
    scope: z
      .object({
        own_tests: z
          .boolean()
          .optional()
          .describe("Run the object's own tests (default true)."),
        foreign_tests: z
          .boolean()
          .optional()
          .describe(
            'Execute the assigned tests (default false); a CDS view run sets it true.',
          ),
        add_foreign_tests_as_preview: z
          .boolean()
          .optional()
          .describe(
            'List the assigned tests as a preview, unexecuted (default true).',
          ),
      })
      .optional()
      .describe(
        'Which tests the run covers. Assigned tests are test classes linked to the object by an ABAP Doc @testing relation (the tests of a CDS view are such).',
      ),
    risk_level: z
      .object({
        harmless: z
          .boolean()
          .optional()
          .describe('Run harmless tests (default true).'),
        dangerous: z
          .boolean()
          .optional()
          .describe('Run dangerous tests (default true).'),
        critical: z
          .boolean()
          .optional()
          .describe('Run critical tests (default true).'),
      })
      .optional()
      .describe('Risk levels the run accepts.'),
    duration: z
      .object({
        short: z
          .boolean()
          .optional()
          .describe('Run short tests (default true).'),
        medium: z
          .boolean()
          .optional()
          .describe('Run medium tests (default true).'),
        long: z.boolean().optional().describe('Run long tests (default true).'),
      })
      .optional()
      .describe('Durations the run accepts.'),
    wait: WAIT_FIELD,
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleRunAbapUnit(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RunAbapUnit',
        shape: 'assembled',
      },
      () => answeredRunAbapUnit(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRunAbapUnit(context, args);
}

async function answeredRunAbapUnit(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const target = runTargetOf(args.target);
  if (target instanceof Error) return return_error(target);
  const { scope, riskLevel, duration } = runFlagsOf(args);
  const wait = waitOf(args);
  const detail = detailOf(args);
  const runner = new AdtExecutor(
    context.connection,
    context.logger,
  ).getAbapUnitTestRunner(ourUnitTest);
  return answer(
    { tool: 'RunAbapUnit', detail },
    () =>
      waitForRun(runner, wait, () =>
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
