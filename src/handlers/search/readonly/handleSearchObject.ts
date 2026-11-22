import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtSearchObjectsParamsOf } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { adtClientOf, type ServerAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
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
import {
  attr,
  child,
  isList,
  type XmlList,
  type XmlRead,
} from '../../../lib/xml/tree';

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

export interface SearchHit {
  name: string;
  type: string;
  description: string;
  packageName?: string | undefined;
  /** The object's address (`adtcore:uri`), when the hit names one. */
  uri?: string;
}

/**
 * `adtcore:objectReferences/adtcore:objectReference`, attributes only — the
 * same field set `@mcp-abap-adt/adt-clients`' own (unexported)
 * `parseSearchResults` reads out of the identical document (see
 * `core/shared/search.js`). `search`'s injected reading here is the generic
 * `structured` parse (`resultSets.ts`'s `READING_BY_SLOT`), so this walks that
 * tree directly rather than re-running a parser of its own.
 */
export function parseSearchHits(value: XmlRead): SearchHit[] {
  const root =
    child(value, 'adtcore:objectReferences') ??
    child(value, 'objectReferences');
  if (!root) return [];
  const refsRaw =
    child(root, 'adtcore:objectReference') ?? child(root, 'objectReference');
  const refs = isList(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : [];
  const hits: SearchHit[] = [];
  for (const ref of refs) {
    const a = child(ref, '@');
    const name = attr(a, 'adtcore:name') ?? attr(a, 'name');
    const type = attr(a, 'adtcore:type') ?? attr(a, 'type');
    if (!name || !type) continue;
    const uri = attr(a, 'adtcore:uri') ?? attr(a, 'uri');
    hits.push({
      name,
      type,
      description:
        attr(a, 'adtcore:description') ?? attr(a, 'description') ?? '',
      packageName: attr(a, 'adtcore:packageName') ?? attr(a, 'packageName'),
      ...(uri === undefined ? {} : { uri }),
    });
  }
  return hits;
}

/** The same tab-separated shape this tool answered before the migration. */
function objectReferenceLines(value: XmlRead): string {
  const hits = parseSearchHits(value);
  if (hits.length === 0) return '';
  const lines = ['name\ttype\tdescription\tpackage'];
  for (const h of hits) {
    lines.push(
      `${h.name}\t${h.type}\t${h.description}\t${h.packageName ?? ''}`,
    );
  }
  return lines.join('\n');
}

/**
 * What `SearchObject` answers at each `detail`: the reading the search is
 * read with, selected before the call (`src/lib/detail`) — terse the hits
 * read out of the structured parse, written as lines. adt-strategies'
 * `utilSearchHits` is not used: it does not decode a numeric character
 * reference (`&#x26;` stays as written), where the parse answers `&`.
 */
const SEARCH_READINGS: DetailTable<XmlNode | string> = {
  terse: formatted(structuredValue, objectReferenceLines),
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
