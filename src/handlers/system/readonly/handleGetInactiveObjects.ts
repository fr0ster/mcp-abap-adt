/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'GetInactiveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Get a list of inactive ABAP objects — modified but not yet activated, pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.',
  inputSchema: {
    type: 'object',
    properties: { ...DETAIL_PROPERTY },
    required: [],
  },
} as const;

interface InactiveObjectRef {
  type: string;
  name: string;
}

/**
 * `ioc:inactiveObjects/ioc:entry/ioc:object/ioc:ref`, attributes
 * `adtcore:type`/`adtcore:name` — the exact shape the SHIPPED `inactive`
 * reading parses (see `core/shared/getInactiveObjects.js`'s `inactiveObjects`
 * strategy), read here off the generic `structured` parse that overrides it
 * (`resultSets.ts`'s `READING_BY_SLOT`), field names unchanged. `entry` is one
 * of `structured`'s forced-array element names, so this holds regardless of
 * how many objects are inactive.
 */
function extractInactiveObjects(value: unknown): InactiveObjectRef[] {
  const root = (value as any)?.['ioc:inactiveObjects'];
  if (!root) return [];
  const entriesRaw = root['ioc:entry'];
  const entries = Array.isArray(entriesRaw)
    ? entriesRaw
    : entriesRaw
      ? [entriesRaw]
      : [];
  const objects: InactiveObjectRef[] = [];
  for (const entry of entries) {
    const ref = entry?.['ioc:object']?.['ioc:ref'];
    if (!ref) continue;
    const a = ref['@'] ?? {};
    objects.push({
      type: a['adtcore:type'] ?? '',
      name: a['adtcore:name'] ?? '',
    });
  }
  return objects;
}

export async function handleGetInactiveObjects(
  context: HandlerContext,
  args: { detail?: 'terse' | 'full' | 'raw' },
) {
  const { connection, logger } = context;
  const detail = detailOf(args);

  logger?.info('Retrieving inactive objects...');

  // `getInactiveObjects()` took no parameters at all until adt-clients 23 gave
  // every member an options object; the refusal reading is passed there now,
  // because "nothing is inactive" and "the read was refused" are answers a
  // caller must not confuse — this is the member the activation suites poll.
  return answer(
    { tool: 'GetInactiveObjects', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getInactiveObjects({ analyse: analyseException }),
    project(detail, (value) => {
      const objects = extractInactiveObjects(value);
      return { success: true, count: objects.length, objects };
    }),
  );
}
