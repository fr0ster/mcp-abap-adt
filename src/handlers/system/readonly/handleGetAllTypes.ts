import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * Handler for retrieving all valid ADT object types.
 */

import {
  analyseException,
  type INamedItem,
  utilNamedItems,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';

export const TOOL_DEFINITION = {
  name: 'GetAdtTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.',
  inputSchema: z.object({
    validate_type: z
      .string()
      .optional()
      .describe('Type name to validate (optional)'),
    ...DETAIL_SHAPE,
  }),
} as const;

/**
 * What `GetAdtTypes` answers at each `detail`: the reading the type list is
 * read with, selected before the call (`src/lib/detail`) — terse the named
 * items as adt-strategies reads `nameditem:namedItemList`
 * (`utilNamedItems`: each item's name and description, an item without a
 * name dropped), full the parse, raw the document.
 */
const TYPE_READINGS: DetailTable<readonly INamedItem[] | XmlNode | string> = {
  terse: formatted(utilNamedItems, (items) => items),
  full: fullLevel,
  raw: rawLevel,
};

export async function handleGetAdtTypes(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  const detail = detailOf(args);

  // `getAllTypes(maxItemCount?, name?, data?, options?)` takes
  // `analyseException` since adt-clients 23.
  return answer(
    { tool: 'GetAdtTypes', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils({ ...ourUtils, types: readingAt(TYPE_READINGS, detail) })
        .getAllTypes(999, '*', 'usedByProvider', { analyse: analyseException }),
    answered,
  );
}
