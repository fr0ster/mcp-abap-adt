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
import { purpose, toolDescription } from '../../../lib/description';
import {
  about,
  answered,
  fullLevel,
  headShape,
  type ListDetailTable,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  writeListing,
  writeWhole,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';

/** The lists the type listing writes: what its description states. */
export const TYPES_LISTS: RowSchemas<{ items: INamedItem[] }> = {
  items: about(
    'for each object type',
    rows('items', {
      columns: [
        {
          name: 'name',
          means: 'its code',
          cell: (item: INamedItem) => item.name,
        },
        {
          name: 'description',
          means: 'its description',
          cell: (item: INamedItem) =>
            (item.description ?? '').split('\n')[0] ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** The head the type listing opens with. */
export const TYPES_HEADS = [headShape('count', 'how many there are')];

/**
 * The largest `maxItemCount` SAP accepts, passed when the consumer gives no
 * count (#391, the owner: the server always passes a value, so the library's
 * own 999 never applies). Measured on the BTP ABAP environment (2026-11-27):
 * 2147483647 answered all 375 object types, 2147483648 was refused `400`
 * ("Overflow converting from …"); without the parameter SAP answered 100,
 * `0` and `-1` 100 as well.
 */
export const SAP_MAX_ITEM_COUNT = 2147483647;

export const TOOL_DEFINITION = {
  name: 'GetAdtTypes',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the repository object types the ABAP system knows, by their type codes.',
    ),
  }),
  inputSchema: z.object({
    validate_type: z
      .string()
      .optional()
      .describe('Type name to validate (optional)'),
    max_item_count: z
      .number()
      .int()
      .optional()
      .describe(
        `Most object types to read. Absent: ${SAP_MAX_ITEM_COUNT}, the largest count SAP accepts, which reads every type.`,
      ),
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
const TYPE_READINGS: ListDetailTable<INamedItem[] | XmlNode | string> = {
  // Every type the list held, written by the listing writer.
  terse: written(utilNamedItems, (items: INamedItem[]) =>
    writeListing({
      heads: [{ head: 'count', value: String(items.length) }],
      reading: { items },
      lists: TYPES_LISTS,
    }),
  ),
  // The named items whole, as read.
  medium: written(utilNamedItems, (items) => writeWhole(items)),
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
        .getAllTypes(
          args.max_item_count ?? SAP_MAX_ITEM_COUNT,
          '*',
          'usedByProvider',
          {
            analyse: analyseException,
          },
        ),
    answered,
  );
}
