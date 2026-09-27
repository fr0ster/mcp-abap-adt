import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { ourUtils } from '../strategies/resultSets';

export interface SearchObjectsArgs {
  query: string;
  objectType: 'DEVC';
  maxResults: number;
}

export type SearchObjectsFn = (args: SearchObjectsArgs) => Promise<string[]>;

export interface PackageResolverDeps {
  searchObjects: SearchObjectsFn;
}

const WILDCARD_RE = /[*+]/;

function isPattern(entry: string): boolean {
  return WILDCARD_RE.test(entry);
}

export async function resolvePackagePatterns(
  deps: PackageResolverDeps,
  entries: string[],
): Promise<string[]> {
  const exact: string[] = [];
  const resolved: string[] = [];
  for (const entry of entries) {
    if (isPattern(entry)) {
      const names = await deps.searchObjects({
        query: entry,
        objectType: 'DEVC',
        maxResults: 1000,
      });
      resolved.push(...names);
    } else {
      exact.push(entry);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...exact, ...resolved]) {
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * `searchObjects`'s replacement: `search`. `searchObjects` sat beside
 * `search` doing the identical request until adt-clients 31.0.0, per
 * `search()`'s own doc comment (not `AdtUtils`'s class-level one, which says
 * nothing about the rename) — this is the rename the guide's `search`
 * migration is, everywhere but `handleSearchObject.ts`.
 *
 * **Both the set and `analyse` now, and the asymmetry this comment used to
 * describe is gone.** It read: `getUtils(ourUtils)` resolves `search` through
 * the narrower `IAdtObjectSearch` contract, one parameter only, so a second
 * argument was TS2554 — which is why this resolver called `getUtils()` bare and
 * relied on the shipped `utilDocuments.search` answering parsed hits.
 * `interfaces-adt` 11 gave that contract an `options` parameter like every other
 * member (79 of them), and adt-clients 23 made every shipped default the
 * document. So the bare call would now answer a string, and the set is what
 * names the reading: `ourUtils` stamps `search` with the library's
 * `utilSearchHits` wrapped in ours.
 */
export function createPackagePatternResolver(
  ctx: HandlerContext,
): SearchObjectsFn {
  const client = createAdtClient(ctx.connection, ctx.logger);
  const utils = client.getUtils(ourUtils);
  return async ({ query, objectType, maxResults }) => {
    const response = await utils.search(
      { query, objectType, maxResults },
      { analyse: analyseException },
    );
    if (!response.ok) {
      throw new Error(response.getError().message);
    }
    // The `search` slot is the library's reading wrapped in ours, so the hits
    // are in `value` and the document sits beside them — `detail: 'raw'` has
    // something to answer wherever this reading is projected.
    return response.getResult().value.value.map((hit) => hit.name);
  };
}
