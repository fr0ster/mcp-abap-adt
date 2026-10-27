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
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Activates the repository objects named by objects (each a name and a type) together, in one activation: any object type, related objects such as domains, data elements and tables at once.',
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
              description: 'Object name in uppercase',
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
        description:
          "Request pre-audit before activation. Default: true. Sent as preauditRequested when more than one object is activated, or one object of a type without a family of its own here. A single class, program, interface, function group, table, structure, CDS source, domain, data element, behavior definition or metadata extension is activated by its own family's activate(), which always sends preauditRequested=true.",
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
