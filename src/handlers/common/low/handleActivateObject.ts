/**
 * ActivateObject Handler - Universal ABAP Object Activation via ADT API
 */

import { AdtClient, type ObjectReference } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  parseActivationResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateObjectLow',
  description:
    '[low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.',
  inputSchema: {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        description:
          "Array of objects to activate. Each object must have 'name' and 'type'. URI is optional.",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Object name in uppercase' },
            type: {
              type: 'string',
              description:
                "Object type code (e.g., 'CLAS/OC', 'PROG/P', 'DDLS/DF')",
            },
            uri: { type: 'string', description: 'Optional ADT URI' },
          },
          required: ['name', 'type'],
        },
      },
      preaudit: {
        type: 'boolean',
        description: 'Request pre-audit before activation. Default: true',
      },
    },
    required: ['objects'],
  },
} as const;

interface ActivationObject extends ObjectReference {
  uri?: string;
}

interface ActivateObjectArgs {
  objects: ActivationObject[];
  preaudit?: boolean;
}

export async function handleActivateObject(
  context: HandlerContext,
  params: ActivateObjectArgs,
) {
  const { connection, logger } = context;
  try {
    const args = params;

    if (
      !args.objects ||
      !Array.isArray(args.objects) ||
      args.objects.length === 0
    ) {
      return return_error(
        new Error(
          'Missing required parameter: objects (must be non-empty array)',
        ),
      );
    }

    const preaudit = args.preaudit !== false; // default true
    const client = new AdtClient(connection);

    logger?.info(`Starting activation of ${args.objects.length} object(s)`);

    try {
      const activationObjects = args.objects.map((obj) => ({
        type: obj.type,
        name: obj.name.toUpperCase(),
      }));

      logger?.debug(
        `Activating objects: ${activationObjects.map((o) => o.name).join(', ')}`,
      );

      const response = await client
        .getUtils()
        .activateObjectsGroup(activationObjects, preaudit);
      logger?.debug(`Activation response status: ${response.status}`);

      const activationResult = parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      const result = {
        success,
        objects_count: args.objects.length,
        objects: activationObjects.map((obj, idx) => ({
          name: obj.name,
          uri: args.objects[idx].uri,
          type: args.objects[idx].type,
        })),
        activation: {
          activated: activationResult.activated,
          checked: activationResult.checked,
          generated: activationResult.generated,
        },
        messages: activationResult.messages,
        warnings: activationResult.messages.filter(
          (m) => m.type === 'warning' || m.type === 'W',
        ),
        errors: activationResult.messages.filter(
          (m) => m.type === 'error' || m.type === 'E',
        ),
        message: success
          ? `Successfully activated ${args.objects.length} object(s)`
          : `Activation completed with ${activationResult.messages.length} message(s)`,
      };

      logger?.info(
        `Activation completed: ${success ? 'SUCCESS' : 'WITH ISSUES'}`,
      );

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    } catch (error: any) {
      logger?.error('Error during activation', error);

      let errorMessage: string;
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else {
          try {
            errorMessage = JSON.stringify(error.response.data);
          } catch {
            errorMessage = `HTTP ${error.response.status}: ${error.response.statusText || 'Error'}`;
          }
        }
      } else {
        errorMessage = error.message || String(error);
      }

      return return_error(
        new Error(`Failed to activate objects: ${errorMessage}`),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
