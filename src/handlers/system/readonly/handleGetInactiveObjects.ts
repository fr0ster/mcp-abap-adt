import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { attr, child, entries, isList, listOf } from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetInactiveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Get a list of inactive ABAP objects — modified and pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.',
  inputSchema: z.object({ ...DETAIL_SHAPE }),
} as const;

interface InactiveObjectRef {
  type: string;
  name: string;
  /**
   * The owning object, where the answer names one — a function module's group.
   * An activation is addressed through it (`ActivateObjectLow`'s `parentName`);
   * without it the module's own name lands in the group's place.
   */
  parentName?: string;
}

/** One entry's fields; `adtcore:parentUri`'s last segment is the owner's name. */
function refOf(a: unknown): InactiveObjectRef {
  const parentUri = attr(a, 'adtcore:parentUri');
  const parent = parentUri
    ? decodeURIComponent(parentUri.split('/').filter(Boolean).pop() ?? '')
    : '';
  return {
    type: attr(a, 'adtcore:type') ?? '',
    name: attr(a, 'adtcore:name') ?? '',
    ...(parent ? { parentName: parent.toUpperCase() } : {}),
  };
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
  // BASIS 7.40 answers another document: `adtcore:objectReferences`, one
  // `adtcore:objectReference` per object (measured 2026-10-01). Read as the
  // newer shape it gave `count: 0` over eight inactive objects.
  const legacy = child(value, 'adtcore:objectReferences');
  if (legacy !== undefined) {
    return listOf(child(legacy, 'adtcore:objectReference'))
      .map((ref) => child(ref, '@'))
      .filter((a) => attr(a, 'adtcore:name'))
      .map(refOf);
  }
  const root = child(value, 'ioc:inactiveObjects');
  if (root === undefined) {
    // A document neither shape describes is not "nothing is inactive": an
    // activation is confirmed off this answer, and a 0 read off the wrong
    // document confirms one that did not happen.
    throw new Error(
      `GetInactiveObjects: unrecognised document (root: ${
        entries(value)
          .map(([name]) => name)
          .join(', ') || 'none'
      })`,
    );
  }
  const entriesRaw = child(root, 'ioc:entry');
  const listed = isList(entriesRaw)
    ? entriesRaw
    : entriesRaw
      ? [entriesRaw]
      : [];
  const objects: InactiveObjectRef[] = [];
  // `ioc:object` comes back as an array too — `structured` forces
  // `object` to one. Read as a single element it gave no `ioc:ref`, and
  // every entry was dropped: this tool answered "count: 0" over an
  // inactive BDEF on premise (2026-09-26), and so did every caller relying on
  // it to confirm an activation.
  for (const entry of listed) {
    for (const object of listOf(child(entry, 'ioc:object'))) {
      for (const ref of listOf(child(object, 'ioc:ref'))) {
        const a = child(ref, '@');
        if (!attr(a, 'adtcore:name')) continue;
        objects.push(refOf(a));
      }
    }
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

  // `getInactiveObjects(options?)` takes `analyseException` since adt-clients 23.
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
