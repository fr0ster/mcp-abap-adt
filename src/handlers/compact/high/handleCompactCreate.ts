import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleCreateClass } from '../../class/high/handleCreateClass';
import { handleCreateDomain } from '../../domain/high/handleCreateDomain';
import { handleCreateFunctionModule } from '../../function/high/handleCreateFunctionModule';
import { handleCreateProgram } from '../../program/high/handleCreateProgram';
import type {
  CompactCreateArgsByType,
  CompactObjectType,
} from './compactObjectTypes';
import { compactCreateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'CompactCreate',
  description:
    'Compact facade create operation. Routes by object_type to create CLASS/PROGRAM/DOMAIN/FUNCTION_MODULE.',
  inputSchema: compactCreateSchema,
} as const;

type CompactCreateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleCompactCreate(
  context: HandlerContext,
  args: CompactCreateArgs,
) {
  try {
    if (!args?.object_type) {
      return return_error(new Error('object_type is required'));
    }

    switch (args.object_type) {
      case 'CLASS':
        return handleCreateClass(
          context,
          args as unknown as CompactCreateArgsByType['CLASS'],
        );
      case 'PROGRAM':
        return handleCreateProgram(
          context,
          args as unknown as CompactCreateArgsByType['PROGRAM'],
        );
      case 'DOMAIN':
        return handleCreateDomain(
          context,
          args as unknown as CompactCreateArgsByType['DOMAIN'],
        );
      case 'FUNCTION_MODULE':
        return handleCreateFunctionModule(
          context,
          args as unknown as CompactCreateArgsByType['FUNCTION_MODULE'],
        );
      default:
        return return_error(
          new Error(
            `Unsupported object_type for CompactCreate: ${args.object_type}`,
          ),
        );
    }
  } catch (error) {
    return return_error(error);
  }
}
