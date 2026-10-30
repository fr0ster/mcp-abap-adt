/**
 * ActivateObjects Handler - Group/mass activation of ABAP repository objects
 *
 * Activates one or multiple objects in a single call.
 * Uses the ADT group activation endpoint (/sap/bc/adt/activation).
 */

import type { ProjectionVariant } from '../../../lib/adtProjections';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { byVariant } from '../../../lib/variantDefinition';
import {
  activationTypeDescription,
  handleActivateObject,
  preauditDescription,
} from '../low/handleActivateObject';

export const TOOL_DEFINITION = {
  name: 'ActivateObjects',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description:
      'Activates the repository objects named by objects (each a name and a type) together, in one activation: any object type, related objects such as domains, data elements and tables at once.',
    inputSchema: activateObjectsSchema(variant),
  })),
} as const;

/** ActivateObjects' input on `variant`. */
function activateObjectsSchema(variant: ProjectionVariant) {
  return {
    type: 'object',
    properties: {
      objects: {
        type: 'array',
        description:
          "Array of objects to activate. Each object must have 'name' and 'type'.",
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Object name in uppercase',
            },
            type: {
              type: 'string',
              description: activationTypeDescription(variant),
            },
          },
          required: ['name', 'type'],
        },
      },
      preaudit: {
        type: 'boolean',
        description: preauditDescription(variant),
      },
    },
    required: ['objects'],
  } as const;
}

export async function handleActivateObjects(
  context: HandlerContext,
  args: unknown,
) {
  return handleActivateObject(context, args as any);
}
