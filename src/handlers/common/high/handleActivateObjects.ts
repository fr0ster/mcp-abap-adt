/**
 * ActivateObjects Handler - Group/mass activation of ABAP repository objects
 *
 * Activates one or multiple objects in a single call.
 * Uses the ADT group activation endpoint (/sap/bc/adt/activation).
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleActivateObject } from '../low/handleActivateObject';

export const TOOL_DEFINITION = {
  name: 'ActivateObjects',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Activate one or multiple ABAP repository objects. Use after Create/Update when objects remain inactive, or for group activation of related objects (e.g., domains + data elements + tables together). Works with any object type.',
  inputSchema: {
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
              description:
                'Object name in uppercase (e.g., ZOK7_D_MTART, ZCL_MY_CLASS)',
            },
            type: {
              type: 'string',
              description:
                'Object type code: DOMA (domain), DTEL (data element), TABL (table), STRU (structure), DDLS (CDS view), CLAS (class), INTF (interface), PROG (program), FUGR (function group), FUGR/FF (function module), TTYP (table type), SRVD (service definition), SRVB (service binding), BDEF (behavior definition), DDLX (metadata extension), DCLS (access control), ENHO (enhancement)',
            },
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

export async function handleActivateObjects(
  context: HandlerContext,
  args: unknown,
) {
  return handleActivateObject(context, args as any);
}
