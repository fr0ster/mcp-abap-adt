import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleDeleteClass } from '../../class/high/handleDeleteClass';
import { handleDeleteDomain } from '../../domain/high/handleDeleteDomain';
import { handleDeleteFunctionModule } from '../../function_module/high/handleDeleteFunctionModule';
import { handleDeleteProgram } from '../../program/high/handleDeleteProgram';
import type {
  CompactDeleteArgsByType,
  CompactObjectType,
} from './compactObjectTypes';
import { compactDeleteSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'CompactDelete',
  description:
    'Compact facade delete operation. Routes by object_type to delete CLASS/PROGRAM/DOMAIN/FUNCTION_MODULE.',
  inputSchema: compactDeleteSchema,
} as const;

type CompactDeleteArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleCompactDelete(
  context: HandlerContext,
  args: CompactDeleteArgs,
) {
  try {
    if (!args?.object_type) {
      return return_error(new Error('object_type is required'));
    }

    switch (args.object_type) {
      case 'CLASS':
        return handleDeleteClass(
          context,
          args as unknown as CompactDeleteArgsByType['CLASS'],
        );
      case 'PROGRAM':
        return handleDeleteProgram(
          context,
          args as unknown as CompactDeleteArgsByType['PROGRAM'],
        );
      case 'DOMAIN':
        return handleDeleteDomain(
          context,
          args as unknown as CompactDeleteArgsByType['DOMAIN'],
        );
      case 'FUNCTION_MODULE':
        return handleDeleteFunctionModule(
          context,
          args as unknown as CompactDeleteArgsByType['FUNCTION_MODULE'],
        );
      default:
        return return_error(
          new Error(
            `Unsupported object_type for CompactDelete: ${args.object_type}`,
          ),
        );
    }
  } catch (error) {
    return return_error(error);
  }
}
