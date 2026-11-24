import * as z from 'zod';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import {
  analyseException,
  type IInactiveObject,
  type IInactiveObjectsResponse,
  utilInactiveObjects,
} from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  about,
  answered,
  type DetailTable,
  entries,
  fullLevel,
  headShape,
  type ListDetailTable,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  shapesOf,
  type Written,
  writeJson,
  writeListing,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import type { XmlNode } from '../../../lib/xml/node';

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

/**
 * One object as the tool answers it: its code as SAP listed it, its name, and
 * the owner `adtcore:parentUri`'s last segment names.
 */
function refOf(object: IInactiveObject): InactiveObjectRef {
  const parentUri = object.parentUri;
  const segment = parentUri?.split('/').filter(Boolean).pop() ?? '';
  let parent = segment;
  try {
    parent = decodeURIComponent(segment);
  } catch {
    // A segment that does not decode is its own name.
  }
  return {
    type: object.type ?? object.unknownType,
    name: object.name,
    ...(parent ? { parentName: parent.toUpperCase() } : {}),
  };
}

/** An inactive object as read: the reading's own entry. */
type InactiveObject = IInactiveObjectsResponse['objects'][number];

/** The list as the tool answers it at medium: every object, one entry each. */
function inactiveAnswer(read: IInactiveObjectsResponse) {
  return writeJson({ success: true, count: read.objects.length }, read, {
    objects: entries('objects', refOf),
  });
}

/** The lists the inactive objects listing writes: what its description states. */
export const INACTIVE_LISTS: RowSchemas<IInactiveObjectsResponse> = {
  objects: about(
    'for each inactive object',
    rows('objects', {
      columns: [
        {
          name: 'type',
          means: 'its type',
          cell: (o: InactiveObject) => refOf(o).type,
        },
        {
          name: 'name',
          means: 'its name',
          cell: (o: InactiveObject) => refOf(o).name,
        },
        {
          name: 'parent',
          means: 'the object it belongs to, such as a function group',
          cell: (o: InactiveObject) => refOf(o).parentName ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** The head the inactive objects listing opens with. */
export const INACTIVE_HEADS = [headShape('count', 'how many there are')];

export const TOOL_DEFINITION = {
  name: 'GetInactiveObjects',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the inactive ABAP objects of the system: classes, tables, CDS views and other objects changed and awaiting activation.',
    ),
    returns: returnsOf({
      heads: INACTIVE_HEADS,
      shapes: [shapesOf(INACTIVE_LISTS)],
    }),
    inline: true,
  }),
  inputSchema: z.object({ ...DETAIL_SHAPE }),
} as const;

/** The list at terse: a TSV row per object — its type, name and owner. */
function terseInactive(read: IInactiveObjectsResponse): Written<string> {
  return writeListing({
    heads: [{ head: 'count', value: String(read.objects.length) }],
    reading: read,
    lists: INACTIVE_LISTS,
  });
}

/**
 * What `GetInactiveObjects` answers at each `detail`: the reading passed to
 * the call, selected before it (`src/lib/detail`) — terse (TSV) and medium over
 * adt-strategies' `utilInactiveObjects` (0.28.0: both forms SAP answers,
 * every object of an entry, and a document of another kind refused, since an
 * activation is confirmed off this list), full the parse, raw the document.
 */
const INACTIVE_READINGS: ListDetailTable<
  ReturnType<typeof inactiveAnswer>['answer'] | XmlNode | string
> = {
  // Every object the list held, written by the listing writers.
  terse: written(utilInactiveObjects, terseInactive),
  medium: written(utilInactiveObjects, inactiveAnswer),
  full: fullLevel,
  raw: rawLevel,
};

export async function handleGetInactiveObjects(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  const detail = detailOf(args);

  logger?.info('Retrieving inactive objects...');

  // `getInactiveObjects(options?)` takes `analyseException` since adt-clients 23.
  return answer(
    { tool: 'GetInactiveObjects', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils({
          ...ourUtils,
          inactive: readingAt(INACTIVE_READINGS, levelOf(args)),
        })
        .getInactiveObjects({ analyse: analyseException }),
    answered,
  );
}
