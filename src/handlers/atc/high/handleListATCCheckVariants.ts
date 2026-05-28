/**
 * ListATCCheckVariants Handler - List available ATC check variants via AdtClient
 *
 * Reads /sap/bc/adt/atc/variants and returns the XML list of available variants
 * configured on the system. Use this to discover valid values for the
 * check_variant parameter of RunATC.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListATCCheckVariants',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'List available ATC check variants on the SAP system. Returns the variants XML. ' +
    'Use this to discover valid check_variant values for RunATC.',
  inputSchema: {
    type: 'object',
    properties: {
      max_item_count: {
        type: 'number',
        description: 'Maximum number of variants to return (default: 500).',
        default: 500,
      },
      name_pattern: {
        type: 'string',
        description: 'Name filter pattern, "*" for all (default: "*").',
        default: '*',
      },
    },
  },
} as const;

interface ListATCCheckVariantsArgs {
  max_item_count?: number;
  name_pattern?: string;
}

export async function handleListATCCheckVariants(
  context: HandlerContext,
  args: ListATCCheckVariantsArgs,
) {
  const { connection, logger } = context;
  try {
    const { max_item_count, name_pattern } = args as ListATCCheckVariantsArgs;

    const client = createAdtClient(connection, logger);
    const atc = client.getAtc();

    logger?.info('Listing ATC check variants');

    try {
      const response = await atc.listVariants({
        maxItemCount: max_item_count,
        namePattern: name_pattern,
      });
      return return_response({
        data: JSON.stringify(
          {
            success: true,
            variants: response.data,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: unknown) {
      const err = error as Error;
      logger?.error(
        `Error listing ATC variants: ${err?.message ?? String(error)}`,
      );
      return return_error(new Error(err?.message ?? String(error)));
    }
  } catch (error: unknown) {
    return return_error(error as Error);
  }
}
