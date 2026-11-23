import {
  analyseException,
  type ISearchResult,
  utilSearchHits,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtSearchObjectsParamsOf } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { adtClientOf, type ServerAdtClient } from '../../../lib/clients';
import {
  answered,
  completeAnswer,
  type DetailTable,
  formatted,
  fullLevel,
  type Rendered,
  rawLevel,
  readingAt,
  structuredValue,
} from '../../../lib/detail';
import {
  onEveryVariant,
  type RuleVariant,
  requiredText,
  withInCallSchema,
} from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
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

export const TOOL_DEFINITION = {
  name: 'SearchObject',
  available_in: ['onprem', 'cloud'] as const,
  ...onEveryVariant(
    withLongToolAdvice(
      '[read-only] Search ABAP repository by object name or wildcard pattern (e.g. \'Z*\'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by a name of the system\'s object types list (PROG, CLAS, INTF, DEVC, TABL, STRU, DDLS, DTEL, FUGR, FUNC, SRVD, SRVB, BDEF, DDLX, etc.).',
    ),
    schemaOn,
  ),
} as const;

/**
 * The hits as the tab-separated lines this tool answered before the
 * migration: a header and one line per hit, the code as SAP sent it, known
 * or not; no hit answers nothing.
 */
function hitLines(hits: readonly ISearchResult[]): Rendered<string> {
  if (hits.length === 0) return { answer: '', rendered: [] };
  const lines = ['name\ttype\tdescription\tpackage'];
  const rendered: string[] = [];
  for (const h of hits) {
    lines.push(
      `${h.name}\t${h.type ?? h.unknownType}\t${h.description}\t${h.packageName ?? ''}`,
    );
    rendered.push(hitIdentity(h));
  }
  return { answer: lines.join('\n'), rendered };
}

/** A hit's identity: its type (the code SAP sent, known or not) and name. */
const hitIdentity = (h: ISearchResult) =>
  `${h.type ?? h.unknownType}|${h.name}`;

/**
 * What `SearchObject` answers at each `detail`: the reading the search is
 * read with, selected before the call (`src/lib/detail`) — terse the hits
 * as adt-strategies reads them (`utilSearchHits`, which decodes character
 * references since 0.28.0), written as lines.
 */
const SEARCH_READINGS: DetailTable<XmlNode | string> = {
  // Every hit, or nothing (`completeAnswer`).
  terse: formatted(
    utilSearchHits,
    completeAnswer(
      'SearchObject',
      (hits: readonly ISearchResult[]) => hits.map(hitIdentity),
      hitLines,
    ),
  ),
  medium: fullLevel,
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

export async function handleSearchObject(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  // The schema holds the rules: a name, not blank; the type of the list.
  const { object_name, object_type, maxResults } = args;

  const served = adtClientOf(connection, logger);
  const detail = detailOf(args);
  // The reading the search is given, selected by the level asked for.
  const results: SearchResults = {
    ...ourUtils,
    search: readingAt(SEARCH_READINGS, levelOf(args)),
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
