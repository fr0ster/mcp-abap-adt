import * as z from 'zod';
/**
 * ActivateObjects Handler - Group/mass activation of ABAP repository objects
 *
 * Activates one or multiple objects in a single call.
 * Uses the ADT group activation endpoint (/sap/bc/adt/activation).
 */

import type { ProjectionVariant } from '../../../lib/adtProjections';
import { activationParentDescription } from '../../../lib/adtTypeCode';
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
  return z.object({
    objects: z
      .array(
        z.object({
          name: z.string().describe('Object name in uppercase'),
          type: z.string().describe(activationTypeDescription(variant)),
          parentName: z
            .string()
            .optional()
            .describe(activationParentDescription(variant)),
        }),
      )
      .describe(
        "Array of objects to activate. Each object must have 'name' and 'type', and 'parentName' where its type needs one.",
      ),
    preaudit: z.boolean().optional().describe(preauditDescription(variant)),
  });
}

export async function handleActivateObjects(
  context: HandlerContext,
  args: unknown,
) {
  return handleActivateObject(context, args as any);
}
