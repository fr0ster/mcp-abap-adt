import { utilDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException, utilSearchHits } from '@mcp-abap-adt/adt-strategies';
import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { carryingFailure } from '../strategies/step';

export interface SearchObjectsArgs {
  query: string;
  /** A package: the code of the tables (bare `DEVC` is no code of them). */
  objectType: Extract<AdtTypeCode, 'DEVC/K'>;
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
        objectType: 'DEVC/K',
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
 * **`analyse` is passed here, unlike `handleSearchObject.ts`.** That file's
 * own comment establishes the asymmetry with `tsc`: `getUtils(ourUtils)`
 * (a result set injected) resolves `search` through the narrower
 * `IAdtObjectSearch<TSearch>` contract, one parameter only — TS2554 for a
 * second argument. This resolver calls `client.getUtils()` with **no**
 * result set, exactly as it did before migration, so `search` resolves
 * through `AdtUtils`'s own class method instead: `search<E>(criteria,
 * options?: IAdtOperationOptions<E>)`, confirmed against
 * `AdtClient.d.ts`'s two `getUtils` overloads (`getUtils(): AdtUtils` vs.
 * `getUtils<R>(results: R): IAdtInformationSystem<...> & …`). The bare
 * overload also keeps the shipped `utilDocuments.search` reading —
 * `IResultStrategy<ISearchResult[]>`, already parsed hits with a `name` —
 * so the regex walk over `response.data` this resolver used to do by hand
 * is no longer needed at all.
 */
export function createPackagePatternResolver(
  ctx: HandlerContext,
): SearchObjectsFn {
  const client = createAdtClient(ctx.connection, ctx.logger);
  // adt-clients 23 ships the search document as it came; the parsed hits
  // are `utilSearchHits` from adt-strategies (MIGRATION-23 §4).
  const utils = client.getUtils({ ...utilDocuments, search: utilSearchHits });
  return async ({ query, objectType, maxResults }) => {
    const response = await utils.search(
      { query, objectType, maxResults },
      { analyse: analyseException },
    );
    if (!response.ok) {
      throw carryingFailure(
        new Error(response.getError().message),
        response.getError(),
        'search packages',
      );
    }
    return response.getResult().value.map((hit) => hit.name);
  };
}

/** The key of one package search: its arguments. */
function searchKey(args: SearchObjectsArgs): string {
  return `${args.objectType}|${args.maxResults}|${args.query}`;
}

/**
 * A `SearchObjectsFn` answering from `answers`, for the batched version of
 * `SearchSource` (spec §11): a search answered there gives its package names
 * (or throws its failure, as it came); a search with no answer yet is
 * recorded in `asked` and gives no names. `resolvePackagePatterns` run over it
 * once names the searches of a phase; run again once the phase answered, it
 * resolves the packages exactly as over the connection.
 */
export function answeredSearch(
  answers: ReadonlyMap<string, PhaseResult<string[]>>,
  asked: SearchObjectsArgs[],
): SearchObjectsFn {
  return async (args) => {
    const answer = answers.get(searchKey(args));
    if (answer === undefined) {
      asked.push(args);
      return [];
    }
    if (!answer.ok) throw answer.error;
    return answer.value;
  };
}

/**
 * Every search of `asked` in one ADT batch envelope (`runPhase`), each
 * through the package resolver over the phase's batch connection; the
 * answers keyed for `answeredSearch`.
 */
export async function searchPackagesInPhase(
  ctx: HandlerContext,
  asked: readonly SearchObjectsArgs[],
): Promise<Map<string, PhaseResult<string[]>>> {
  const results = await runPhase(ctx, asked, (args, connection) =>
    createPackagePatternResolver({ ...ctx, connection })(args),
  );
  return new Map(
    asked.map((args, i) => [
      searchKey(args),
      results[i] as PhaseResult<string[]>,
    ]),
  );
}
