import { compactCdsUnitTestResultSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetCdsUnitTestResultOnce } from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Reads the result of the CDS unit test run named by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).",
  inputSchema: compactCdsUnitTestResultSchema,
} as const;

type HandlerCdsUnitTestResultArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerCdsUnitTestResult(
  context: HandlerContext,
  args: HandlerCdsUnitTestResultArgs,
) {
  return handleGetCdsUnitTestResultOnce(context, args);
}
