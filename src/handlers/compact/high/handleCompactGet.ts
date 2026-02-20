import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleGetClass } from '../../class/high/handleGetClass';
import { handleGetDomain } from '../../domain/high/handleGetDomain';
import { handleGetFunctionModule } from '../../function_module/high/handleGetFunctionModule';
import { handleGetProgram } from '../../program/high/handleGetProgram';
import type {
  CompactGetArgsByType,
  CompactObjectType,
} from './compactObjectTypes';
import { compactGetSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'CompactGet',
  description:
    'Compact facade read operation. Routes by object_type to get CLASS/PROGRAM/DOMAIN/FUNCTION_MODULE.',
  inputSchema: compactGetSchema,
} as const;

type CompactGetArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleCompactGet(
  context: HandlerContext,
  args: CompactGetArgs,
) {
  try {
    if (!args?.object_type) {
      return return_error(new Error('object_type is required'));
    }

    switch (args.object_type) {
      case 'CLASS':
        return handleGetClass(
          context,
          args as unknown as CompactGetArgsByType['CLASS'],
        );
      case 'PROGRAM':
        return handleGetProgram(
          context,
          args as unknown as CompactGetArgsByType['PROGRAM'],
        );
      case 'DOMAIN':
        return handleGetDomain(
          context,
          args as unknown as CompactGetArgsByType['DOMAIN'],
        );
      case 'FUNCTION_MODULE':
        return handleGetFunctionModule(
          context,
          args as unknown as CompactGetArgsByType['FUNCTION_MODULE'],
        );
      default:
        return return_error(
          new Error(
            `Unsupported object_type for CompactGet: ${args.object_type}`,
          ),
        );
    }
  } catch (error) {
    return return_error(error);
  }
}
