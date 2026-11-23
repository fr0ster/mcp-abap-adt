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
  completeAnswer,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
  tsv,
  Written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
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
 * read with, selected before the call (`src/lib/detail`) — terse a
 * `name\tdescription` row per type, the description's first line (a group
 * type lists its members on the lines after it); medium the named items
 * as adt-strategies reads them, each description whole; full the parse;
 * raw the document. The items are adt-strategies' `utilNamedItems` (since
 * 0.28.0 a name as written, an absent description absent).
 */
const TYPE_READINGS: DetailTable<INamedItem[] | XmlNode | string> = {
  // Every type the list held, or nothing (`completeAnswer`).
  terse: formatted(
    utilNamedItems,
    completeAnswer(
      'GetAdtTypes',
      (items: INamedItem[]) => items.map((item) => item.name),
      (items: INamedItem[]) =>
        Written.lines([
          `# count ${items.length}`,
          Written.tsv(
            ['name', 'description'],
            items.map((item) => ({
              cells: [item.name, (item.description ?? '').split('\n')[0] ?? ''],
              identity: item.name,
            })),
          ),
        ]),
    ),
  ),
  medium: formatted(utilNamedItems, (items) => items),
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
        .getUtils({
          ...ourUtils,
          types: readingAt(TYPE_READINGS, levelOf(args)),
        })
        .getAllTypes(999, '*', 'usedByProvider', { analyse: analyseException }),
    answered,
  );
}
