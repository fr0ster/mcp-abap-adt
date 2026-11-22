import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * Handler for retrieving all valid ADT object types.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
  structuredValue,
  tsv,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';
import {
  child,
  childAt,
  isList,
  text,
  type XmlRead,
} from '../../../lib/xml/tree';

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

interface NamedItem {
  name: string;
  description: string | undefined;
}

/**
 * `nameditem:namedItemList/nameditem:namedItem` — the same document
 * `@mcp-abap-adt/adt-clients`' own (shipped, but overridden here by the
 * generic `structured` reading — see `resultSets.ts`) `namedItems` strategy
 * reads; field names verified against `core/shared/allTypes.js`'s
 * `parseNamedItems`. Not forced into an array by the shared `structured`
 * reading's `REPEATABLE` set — `namedItem` isn't a member of it — so a system
 * with exactly one type would hand back a bare object; normalised here the
 * same way the pre-migration handler already did.
 */
function extractNamedItems(value: XmlRead): NamedItem[] {
  const raw = childAt(value, 'nameditem:namedItemList', 'nameditem:namedItem');
  const items = raw ? (isList(raw) ? raw : [raw]) : [];
  return items.flatMap((item) => {
    const name = text(child(item, 'nameditem:name'));
    return name === undefined || name === ''
      ? []
      : [{ name, description: text(child(item, 'nameditem:description')) }];
  });
}

/**
 * What `GetAdtTypes` answers at each `detail`: the reading the type list is
 * read with, selected before the call (`src/lib/detail`) — terse a
 * `name\tdescription` row per type, the description's first line (a group
 * type lists its members on the lines after it); medium the named items
 * read out of the structured parse, each description whole; full the parse;
 * raw the document.
 * adt-strategies' `utilNamedItems` is not used: it reads a numeric name as a
 * number (`007` answers `7`) and an absent description as `""`, where the
 * tool answers the name as sent and no description.
 */
const TYPE_READINGS: DetailTable<NamedItem[] | XmlNode | string> = {
  terse: formatted(structuredValue, (value) => {
    const items = extractNamedItems(value);
    return [
      `# count ${items.length}`,
      tsv(
        ['name', 'description'],
        items.map((item) => [
          item.name,
          (item.description ?? '').split('\n')[0] ?? '',
        ]),
      ),
    ].join('\n');
  }),
  medium: formatted(structuredValue, extractNamedItems),
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
