import type { ISearchObjectsParams } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'SearchObject',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Search ABAP repository by object name or wildcard pattern (e.g. \'ZOK*\'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by type (PROG, CLAS, INTF, DEVC, TABL, DDLS, DTEL, FUGR, SRVD, SRVB, BDEF, DDLX, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: "[read-only] Object name or mask (e.g. 'MARA*')",
      },
      object_type: {
        type: 'string',
        description:
          "[read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')",
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

  const searchParams: ISearchObjectsParams = {
    query: object_name,
    maxResults: maxResults || 100,
  };
  if (object_type) {
    searchParams.objectType = object_type;
  }

  logger?.info(
    `Searching objects: query=${object_name}${object_type ? ` type=${object_type}` : ''}`,
  );

  const detail = detailOf(args);

  // `search` accepts NO second argument through the typed contract `getUtils`
  // hands back once given a result set: `IAdtObjectSearch<TSearch>.search`
  // declares one parameter, and the wider `AdtUtils`-own `search<E>(criteria,
  // options?)` is not the type this call sees once `ourUtils` is injected —
  // verified with `tsc`: passing a second `{ analyse }` argument here is
  // TS2554, "Expected 1 arguments, but got 2." The brief says this member
  // "accepts an analyse and gets one"; the installed declaration disagrees,
  // so none is passed.
  return answer(
    { tool: 'SearchObject', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .search(searchParams),
    project(detail, (value) => objectReferenceLines(value)),
  );
}
