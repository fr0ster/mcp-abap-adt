import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';
import { handleUpdateClass } from '../../class/high/handleUpdateClass';
import { handleUpdateDomain } from '../../domain/high/handleUpdateDomain';
import { handleUpdateFunctionModule } from '../../function/high/handleUpdateFunctionModule';
import { handleUpdateProgram } from '../../program/high/handleUpdateProgram';
import type {
  CompactObjectType,
  CompactUpdateArgsByType,
} from './compactObjectTypes';
import { compactUpdateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'CompactUpdate',
  description:
    'Compact facade update operation. Routes by object_type to update CLASS/PROGRAM/DOMAIN/FUNCTION_MODULE.',
  inputSchema: compactUpdateSchema,
} as const;

type CompactUpdateArgs = { object_type: CompactObjectType } & Record<
  string,
  unknown
>;

export async function handleCompactUpdate(
  context: HandlerContext,
  args: CompactUpdateArgs,
) {
  try {
    if (!args?.object_type) {
      return return_error(new Error('object_type is required'));
    }

    switch (args.object_type) {
      case 'CLASS':
        return handleUpdateClass(
          context,
          args as unknown as CompactUpdateArgsByType['CLASS'],
        );
      case 'PROGRAM':
        return handleUpdateProgram(
          context,
          args as unknown as CompactUpdateArgsByType['PROGRAM'],
        );
      case 'DOMAIN':
        return handleUpdateDomain(
          context,
          args as unknown as CompactUpdateArgsByType['DOMAIN'],
        );
      case 'FUNCTION_MODULE':
        return handleUpdateFunctionModule(
          context,
          args as unknown as CompactUpdateArgsByType['FUNCTION_MODULE'],
        );
      default:
        return return_error(
          new Error(
            `Unsupported object_type for CompactUpdate: ${args.object_type}`,
          ),
        );
    }
  } catch (error) {
    return return_error(error);
  }
}
