import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';

export const TOOL_DEFINITION = {
  name: 'GetFunction',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description: '[read-only] Retrieve ABAP Function Module source code.',
  inputSchema: {
    function_name: z.string().describe('Name of the function module'),
    function_group: z.string().describe('Name of the function group'),
    version: z
      .enum(['active', 'inactive'])
      .default('active')
      .describe('Version to read'),
  },
} as const;

export async function handleGetFunction(context: HandlerContext, args: any) {
  // Delegate to GetFunctionModule, mapping parameter names
  return handleGetFunctionModule(context, {
    function_module_name: args?.function_name,
    function_group_name: args?.function_group,
    version: args?.version,
  });
}
