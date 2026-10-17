import { compactCdsUnitTestResultSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetCdsUnitTestResultOnce } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Reads the result of a CDS unit test run by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).",
  inputSchema: compactCdsUnitTestResultSchema,
} as const;

type HandlerCdsUnitTestResultArgs = {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
};

export async function handleHandlerCdsUnitTestResult(
  context: HandlerContext,
  args: HandlerCdsUnitTestResultArgs,
) {
  return handleGetCdsUnitTestResultOnce(context, args);
}
