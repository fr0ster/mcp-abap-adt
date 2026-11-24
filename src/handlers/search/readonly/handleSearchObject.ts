import {
  analyseException,
  type ISearchResult,
  utilSearchHits,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtSearchObjectsParamsOf } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { answer, type McpResult } from '../../../lib/answer';
import { adtClientOf, type ServerAdtClient } from '../../../lib/clients';
import {
  longRunning,
  purpose,
  returnsOf,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  answered,
  type Column,
  type DetailTable,
  fullLevel,
  type ListDetailTable,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  shapesOf,
  structuredValue,
  type Written,
  whole,
  writeListing,
  written,
} from '../../../lib/detail';
import {
  onEveryVariant,
  type RuleVariant,
  requiredText,
  withInCallSchema,
} from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
import {
  notASearchType,
  SEARCH_TYPE_DESCRIPTION,
  searchNameOf,
} from '../../../lib/searchTypes';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import type { XmlNode } from '../../../lib/xml/node';

/** SearchObject's arguments but `background`. */
const FIELDS = {
  object_name: requiredText('object_name is required').describe(
    "[read-only] Object name or mask (e.g. 'MARA*')",
  ),
  object_type: z
    .string()
    .optional()
    .describe(`[read-only] ${SEARCH_TYPE_DESCRIPTION}`),
  maxResults: z
    .number()
    .default(100)
    .optional()
    .describe('[read-only] Maximum number of results to return'),
  ...DETAIL_SHAPE,
};

/** On a stated variant, `object_type` (when given, not empty) is a search name of its list. */
function searchTypeRule(variant: RuleVariant) {
  return (
    args: { object_type?: string | undefined },
    ctx: z.RefinementCtx,
  ): void => {
    const type = args.object_type;
    if (
      variant !== undefined &&
      type !== undefined &&
      type !== '' &&
      (variant === 'onprem'
        ? searchNameOf('onprem', type)
        : searchNameOf('cloud', type)) === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: notASearchType('object_type', type),
        path: ['object_type'],
      });
    }
  };
}

/** The schema on `variant`, `background` listed; its in-the-call twin beside it. */
function schemaOn(variant: RuleVariant) {
  const rule = searchTypeRule(variant);
  return withInCallSchema(
    z
      .object({ background: LONG_BACKGROUND_FIELD, ...FIELDS })
      .superRefine(rule),
    z.object(FIELDS).superRefine(rule),
  );
}

/** What each object a search found is written with: what its description states. */
export const SEARCH_HIT_COLUMNS: readonly Column<ISearchResult>[] = [
  { name: 'name', means: 'its name', cell: (h) => h.name },
  { name: 'type', means: 'its type', cell: (h) => h.type ?? h.unknownType },
  { name: 'description', means: 'its description', cell: (h) => h.description },
  { name: 'package', means: 'its package', cell: (h) => h.packageName ?? '' },
];

/** The lists a search's listing writes: what its description states. */
export const SEARCH_HITS_LISTS: RowSchemas<{
  hits: readonly ISearchResult[];
}> = {
  hits: about(
    'for each object found',
    rows('hits', { columns: [...SEARCH_HIT_COLUMNS], header: 'when-rows' }),
  ),
};

export const TOOL_DEFINITION = {
  name: 'SearchObject',
  available_in: ['onprem', 'cloud'] as const,
  ...onEveryVariant(
    toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Finds ABAP repository objects by name or name pattern, of any type or of one: classes, programs, tables, interfaces and every other kind.',
      ),
      returns: returnsOf({ shapes: [shapesOf(SEARCH_HITS_LISTS)] }),
      notes: [longRunning],
    }),
    schemaOn,
  ),
} as const;

/**
 * The hits as the tab-separated lines this tool answered before the
 * migration: a header and one line per hit, the code as SAP sent it, known
 * or not; no hit answers nothing.
 */
function hitLines(hits: readonly ISearchResult[]): Written<string> {
  return writeListing({
    heads: [],
    reading: { hits },
    lists: SEARCH_HITS_LISTS,
  });
}

/**
 * What `SearchObject` answers at each `detail`: the reading the search is
 * read with, selected before the call (`src/lib/detail`) — terse the hits
 * as adt-strategies reads them (`utilSearchHits`, which decodes character
 * references since 0.28.0), written as lines.
 */
const SEARCH_READINGS: ListDetailTable<XmlNode | string> = {
  // Every hit, written by the listing writer.
  terse: written(utilSearchHits, hitLines),
  // The parse whole, as it is.
  medium: whole(fullLevel),
  full: fullLevel,
  raw: rawLevel,
};

/** The utilities' result set a search is given: its `search` reading selected per level. */
type SearchResults = typeof ourUtils & {
  search: ReturnType<typeof readingAt<XmlNode | string>>;
};

/**
 * The search `served`'s variant sends for `query`: its filter the search name
 * `objectType` is or stands for on that variant (`searchNameOf`), read once
 * here; the refusal in fixed words when it names none, and nothing is sent.
 */
function searchOn(
  served: ServerAdtClient,
  query: string,
  maxResults: number,
  objectType: string | undefined,
  results: SearchResults,
) {
  if (served.variant === 'onprem') {
    const name =
      objectType === undefined ? undefined : searchNameOf('onprem', objectType);
    if (objectType !== undefined && name === undefined) {
      return notASearchType('object_type', objectType);
    }
    const params: IAdtSearchObjectsParamsOf<'onprem'> = {
      query,
      maxResults,
      ...(name === undefined ? {} : { objectType: name }),
    };
    return () =>
      served.client
        .getUtils(results)
        .search(params, { analyse: analyseException });
  }
  const name =
    objectType === undefined ? undefined : searchNameOf('cloud', objectType);
  if (objectType !== undefined && name === undefined) {
    return notASearchType('object_type', objectType);
  }
  const params: IAdtSearchObjectsParamsOf<'cloud'> = {
    query,
    maxResults,
    ...(name === undefined ? {} : { objectType: name }),
  };
  return () =>
    served.client
      .getUtils(results)
      .search(params, { analyse: analyseException });
}

/** SearchObject's arguments, as its schema parses them. */
type SearchArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * A search's answer, and the hits its typed reading read at terse
 * (`utilSearchHits`): what a tool describing objects by their search reads,
 * never the answer's text. No hits at another level or on a failure.
 */
export interface SearchedObjects {
  readonly result: McpResult;
  readonly hits: readonly ISearchResult[];
}

/** The search of `args`, its typed hits beside its answer. */
export async function searchObjects(
  context: HandlerContext,
  args: SearchArgs,
): Promise<SearchedObjects> {
  let hits: readonly ISearchResult[] = [];
  const result = await searchWith(context, args, {
    ...SEARCH_READINGS,
    terse: written((wire) => {
      hits = utilSearchHits(wire);
      return hits;
    }, hitLines),
  });
  return { result, hits };
}

export async function handleSearchObject(
  context: HandlerContext,
  args: SearchArgs,
): Promise<McpResult> {
  return searchWith(context, args, SEARCH_READINGS);
}

/** The search of `args`, read with `readings` at the level asked. */
async function searchWith(
  context: HandlerContext,
  args: SearchArgs,
  readings: ListDetailTable<XmlNode | string>,
): Promise<McpResult> {
  const { connection, logger } = context;
  // The schema holds the rules: a name, not blank; the type of the list.
  const { object_name, object_type, maxResults } = args;

  const served = adtClientOf(connection, logger);
  const detail = detailOf(args);
  // The reading the search is given, selected by the level asked for.
  const results: SearchResults = {
    ...ourUtils,
    search: readingAt(readings, levelOf(args)),
  };
  const search = searchOn(
    served,
    object_name,
    maxResults || 100,
    object_type || undefined,
    results,
  );
  if (typeof search === 'string') return return_error(search);

  logger?.info(
    `Searching objects: query=${object_name}${object_type ? ` type=${object_type}` : ''}`,
  );

  return answer({ tool: 'SearchObject', detail }, search, answered);
}
