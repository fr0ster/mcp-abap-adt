/**
 * Handler for retrieving all valid ADT object types.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'GetAdtTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.',
  inputSchema: {
    type: 'object',
    properties: {
      validate_type: {
        type: 'string',
        description: 'Type name to validate (optional)',
      },
      ...DETAIL_PROPERTY,
    },
    required: [],
  },
} as const;

interface NamedItem {
  name: string;
  description: string;
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
function extractNamedItems(value: unknown): NamedItem[] {
  const list = (value as any)?.['nameditem:namedItemList'];
  const raw = list?.['nameditem:namedItem'];
  const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  return items
    .map((item: any) => ({
      name: item?.['nameditem:name'],
      description: item?.['nameditem:description'],
    }))
    .filter(
      (item: NamedItem) =>
        item.name !== undefined && item.name !== null && item.name !== '',
    );
}

export async function handleGetAdtTypes(
  context: HandlerContext,
  args: { detail?: 'terse' | 'full' | 'raw' },
) {
  const { connection, logger } = context;
  const detail = detailOf(args);

  // `getAllTypes(maxItemCount?, name?, data?, options?)` takes
  // `analyseException` since adt-clients 23.
  return answer(
    { tool: 'GetAdtTypes', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getAllTypes(999, '*', 'usedByProvider', { analyse: analyseException }),
    project(detail, (value) => extractNamedItems(value)),
  );
}
