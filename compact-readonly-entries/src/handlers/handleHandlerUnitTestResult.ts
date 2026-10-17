import { compactUnitTestResultSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetUnitTestResultOnce } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Reads the result of an ABAP Unit test run by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).",
  inputSchema: compactUnitTestResultSchema,
} as const;

type HandlerUnitTestResultArgs = {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
};

export async function handleHandlerUnitTestResult(
  context: HandlerContext,
  args: HandlerUnitTestResultArgs,
) {
  return handleGetUnitTestResultOnce(context, args);
}
