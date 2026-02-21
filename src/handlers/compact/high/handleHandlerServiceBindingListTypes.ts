import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleListServiceBindingTypes } from '../../service_binding/high/handleListServiceBindingTypes';
import { compactServiceBindingListTypesSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingListTypes',
  description:
    'Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.',
  inputSchema: compactServiceBindingListTypesSchema,
} as const;

type HandlerServiceBindingListTypesArgs = {
  response_format?: 'xml' | 'json' | 'plain';
};

export async function handleHandlerServiceBindingListTypes(
  context: HandlerContext,
  args: HandlerServiceBindingListTypesArgs,
) {
  return handleListServiceBindingTypes(context, args);
}
