import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtSearchObjectsParamsOf } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { adtClientOf, type ServerAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  notASearchType,
  SEARCH_TYPE_DESCRIPTION,
  searchNameOf,
} from '../../../lib/searchTypes';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchObject',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Search ABAP repository by object name or wildcard pattern (e.g. \'Z*\'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by a name of the system\'s object types list (PROG, CLAS, INTF, DEVC, TABL, STRU, DDLS, DTEL, FUGR, FUNC, SRVD, SRVB, BDEF, DDLX, etc.).',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      object_name: {
        type: 'string',
        description: "[read-only] Object name or mask (e.g. 'MARA*')",
      },
      object_type: {
        type: 'string',
        description: `[read-only] ${SEARCH_TYPE_DESCRIPTION}`,
      },
      maxResults: {
        type: 'number',
        description: '[read-only] Maximum number of results to return',
        default: 100,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['object_name'],
  },
} as const;

interface SearchHit {
  name: string;
  type: string;
  description: string;
  packageName?: string;
}

/**
 * `adtcore:objectReferences/adtcore:objectReference`, attributes only — the
 * same field set `@mcp-abap-adt/adt-clients`' own (unexported)
 * `parseSearchResults` reads out of the identical document (see
 * `core/shared/search.js`). `search`'s injected reading here is the generic
 * `structured` parse (`resultSets.ts`'s `READING_BY_SLOT`), so this walks that
 * tree directly rather than re-running a parser of its own.
 */
function parseSearchHits(value: unknown): SearchHit[] {
  const root =
    (value as any)?.['adtcore:objectReferences'] ??
    (value as any)?.objectReferences;
  if (!root) return [];
  const refsRaw = root['adtcore:objectReference'] ?? root.objectReference;
  const refs = Array.isArray(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : [];
  const hits: SearchHit[] = [];
  for (const ref of refs) {
    const a = (ref as any)?.['@'] ?? {};
    const name = a['adtcore:name'] ?? a.name;
    const type = a['adtcore:type'] ?? a.type;
    if (!name || !type) continue;
    hits.push({
      name,
      type,
      description: a['adtcore:description'] ?? a.description ?? '',
      packageName: a['adtcore:packageName'] ?? a.packageName ?? undefined,
    });
  }
  return hits;
}

/** The same tab-separated shape this tool answered before the migration. */
function objectReferenceLines(value: unknown): string {
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
 * The search `served`'s variant sends for `query`: its filter the search name
 * `objectType` is or stands for on that variant (`searchNameOf`), read once
 * here; the refusal in fixed words when it names none, and nothing is sent.
 */
function searchOn(
  served: ServerAdtClient,
  query: string,
  maxResults: number,
  objectType: string | undefined,
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
        .getUtils(ourUtils)
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
      .getUtils(ourUtils)
      .search(params, { analyse: analyseException });
}

export async function handleSearchObject(
  context: HandlerContext,
  args: {
    object_name: string;
    object_type?: string;
    maxResults?: number;
    detail?: 'terse' | 'full' | 'raw';
  },
) {
  const { connection, logger } = context;
  const { object_name, object_type, maxResults } = args;
  if (!object_name) {
    return return_error('object_name is required');
  }

  const served = adtClientOf(connection, logger);
  const search = searchOn(
    served,
    object_name,
    maxResults || 100,
    object_type || undefined,
  );
  if (typeof search === 'string') return return_error(search);

  logger?.info(
    `Searching objects: query=${object_name}${object_type ? ` type=${object_type}` : ''}`,
  );

  const detail = detailOf(args);

  return answer(
    { tool: 'SearchObject', detail },
    search,
    project(detail, (value) => objectReferenceLines(value)),
  );
}
