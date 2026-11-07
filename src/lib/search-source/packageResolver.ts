import { utilDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException, utilSearchHits } from '@mcp-abap-adt/adt-strategies';
import { ADT_TYPES_ONPREM } from '@mcp-abap-adt/interfaces-adt';
import type { AdtCodes, TableMainOf } from '../adtProjections';
import { isCredentialFailure } from '../answer';
import { appendAll } from '../appendAll';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { carryingFailure } from '../strategies/step';

/** A package's code in the tables. */
const PACKAGE_CODE: AdtCodes<'DEVC/K'> = 'DEVC/K';

export interface SearchObjectsArgs {
  query: string;
  /** Packages: the search name of their main type (`DEVC`; spec 3.6). */
  objectType: TableMainOf<typeof PACKAGE_CODE>;
  maxResults: number;
}

/**
 * The search name packages are found by: the main type the package code's
 * entry states (`DEVC`), a name of every modern release's object types
 * list. Both modern tables state it alike: `main` is the code's main type
 * by the table contract.
 */
export const PACKAGE_SEARCH_NAME =
  ADT_TYPES_ONPREM.package.codes[PACKAGE_CODE].main;

/**
 * One quick search: the package names it answers, or `undefined` for a
 * search not answered yet (the batched version names its searches first,
 * `answeredSearch`); a search over a connection always answers.
 */
export type SearchObjectsFn = (
  args: SearchObjectsArgs,
) => Promise<string[] | undefined>;

/** A quick search over a connection: every search answered. */
export type AnsweringSearch = (args: SearchObjectsArgs) => Promise<string[]>;

export interface PackageResolverDeps {
  searchObjects: SearchObjectsFn;
}

/**
 * A package entry is a mask when it holds a wildcard of the quick search:
 * `*` (zero or more characters) or `?` (one character). `+`, `_`, `%` and
 * `#` are characters of a package name, so an entry holding neither `*` nor
 * `?` is an exact name.
 */
function isPattern(entry: string): boolean {
  return entry.includes('*') || entry.includes('?');
}

/** The first round's `maxResults` of a mask search; each next round doubles it. */
const FIRST_ROUND = 1000;

/** The packages the entries name. */
export interface ResolvedPackages {
  packages: string[];
}

/**
 * Every package `mask` names: the quick search asked with `maxResults`
 * doubled until its answer holds fewer packages than `maxResults` (the
 * quick search has no window to page around and answers no "more" marker,
 * measured). `undefined` while a round is not answered yet. A round needs
 * the previous round's answer, so the rounds are sequential.
 */
async function resolveMask(
  deps: PackageResolverDeps,
  mask: string,
): Promise<string[] | undefined> {
  for (let maxResults = FIRST_ROUND; ; maxResults *= 2) {
    const names = await deps.searchObjects({
      query: mask,
      objectType: PACKAGE_SEARCH_NAME,
      maxResults,
    });
    if (names === undefined) return undefined;
    if (names.length < maxResults) return names;
  }
}

/**
 * The packages `entries` name: the exact names as given, then every
 * package each mask resolves to, each package once. A mask SAP refuses is
 * skipped; a credential failure ends the call, thrown as it came.
 */
export async function resolvePackagePatterns(
  deps: PackageResolverDeps,
  entries: string[],
): Promise<ResolvedPackages> {
  const exact: string[] = [];
  const resolved: string[] = [];
  for (const entry of entries) {
    if (!isPattern(entry)) {
      exact.push(entry);
      continue;
    }
    try {
      appendAll(resolved, (await resolveMask(deps, entry)) ?? []);
    } catch (error) {
      if (isCredentialFailure(error)) throw error;
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
  return { packages: out };
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
): AnsweringSearch {
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
 * recorded in `asked` and answers `undefined` — not answered, never a short
 * answer. `resolvePackagePatterns` run over it names the searches of the next
 * phase (each mask's next round); run again once every phase answered (a run
 * that asks nothing), it resolves the packages exactly as over the
 * connection.
 */
export function answeredSearch(
  answers: ReadonlyMap<string, PhaseResult<string[]>>,
  asked: SearchObjectsArgs[],
): SearchObjectsFn {
  return async (args) => {
    const answer = answers.get(searchKey(args));
    if (answer === undefined) {
      asked.push(args);
      return undefined;
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
  // One request per distinct search: a mask named twice is one search, so
  // no answer of it can stand in for another's (a later success hiding a
  // credential refusal).
  const distinct = [
    ...new Map(asked.map((args) => [searchKey(args), args])).values(),
  ];
  const results = await runPhase(ctx, distinct, (args, connection) =>
    createPackagePatternResolver({ ...ctx, connection })(args),
  );
  return new Map(distinct.map((args, i) => [searchKey(args), results[i]]));
}
