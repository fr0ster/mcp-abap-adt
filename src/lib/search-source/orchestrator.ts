import { type FailureEntry, isCredentialFailure, thrownEntry } from '../answer';
import { failureOf } from '../auth/failures';
import { type PhaseResult, withSequentialFallback } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import {
  assembleList,
  batchReader,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  type WalkedItem,
  walkPackages,
} from '../strategies/packageWalk';
import { ourUtils } from '../strategies/resultSets';
import { methodFailureOf } from '../strategies/step';
import { scanLines } from './lineScanner';
import {
  createPackageContentsFetcher,
  type EnumerateInput,
  enumerateScanTargets,
  type PackageContentsFetcher,
  type ScanObjectType,
} from './packageEnumerator';
import {
  answeredSearch,
  createPackagePatternResolver,
  type PackageResolverDeps,
  resolvePackagePatterns,
  type SearchObjectsArgs,
  searchPackagesInPhase,
} from './packageResolver';
import {
  answeredReaderDeps,
  createSourceReaderDeps,
  type ReadSourceUnitsDeps,
  readSourcesInPhase,
  readSourceUnits,
  type SourceRead,
  type SourceVersion,
  sourceReadKey,
} from './sourceReader';

export interface OrchestratorInput {
  query: string;
  query2?: string;
  exclude?: string[];
  packages: string[];
  include_subpackages?: boolean;
  object_filter?: string;
  object_types?: readonly ScanObjectType[];
  exclude_comments?: boolean;
  max_hits_per_object?: number;
  emit_no_hits?: boolean;
  max_objects?: number;
  /** Index of the first scan target to read (default 0): `next_start_at` of the previous answer. */
  start_at?: number;
  concurrency?: number;
  version?: SourceVersion;
  /** Internal scan deadline in ms. When exceeded, returns hits gathered so far with truncated.by_timeout=true. */
  time_budget_ms?: number;
}

export interface SearchHit {
  devclass: string;
  object_type: ScanObjectType;
  object_name: string;
  include: string;
  line: number;
  snippet: string;
}

export interface NoHitEntry {
  devclass: string;
  object_type: ScanObjectType;
  object_name: string;
}

/** An object whose read failed: the failure as it is, with its step. */
export interface FailedObject {
  devclass: string;
  object_type: ScanObjectType;
  object_name: string;
  error: FailureEntry;
}

export interface OrchestratorResult {
  results: SearchHit[];
  no_hits?: NoHitEntry[];
  /** Objects whose read failed, beside the others' hits; present only when any did. */
  failures?: FailedObject[];
  scanned: { packages: number; objects: number; sources: number };
  /** The scan targets of the walk, before the slice. */
  total_targets: number;
  /** Present only when targets remain after the slice: pass it as `start_at` to go on. */
  next_start_at?: number;
  truncated: {
    by_object_cap: boolean;
    by_max_objects: boolean;
    /** True when a time_budget_ms deadline was exceeded; results contain hits gathered before the cutoff. */
    by_timeout: boolean;
  };
}

export interface OrchestratorDeps {
  fetchPackageContents: PackageContentsFetcher;
  sourceReader: ReadSourceUnitsDeps;
  resolvePackages: (entries: string[]) => Promise<string[]>;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

const DEFAULTS = {
  include_subpackages: true,
  object_types: ['PROG', 'FUGR', 'CLAS'] as const,
  exclude_comments: false,
  max_hits_per_object: 100,
  emit_no_hits: false,
  max_objects: 500,
  concurrency: 8,
  version: 'active' as SourceVersion,
};

/**
 * The slice of the walk's sorted targets one call reads: `[start_at,
 * start_at + max_objects)`. The one place the slice end is computed.
 */
function sliceTargets<T>(
  all: readonly T[],
  startAt: number,
  maxObjects: number,
): { targets: T[]; total: number; next: number | undefined } {
  const end = startAt + maxObjects;
  return {
    targets: all.slice(startAt, end),
    total: all.length,
    next: end < all.length ? end : undefined,
  };
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onStop?: () => void,
  shouldStop?: () => boolean,
): Promise<void> {
  let next = 0;
  // A failure the worker does not answer as its item's (a defect, not a
  // read) ends the run: no pump takes another item, and the failure is
  // answered once every pump has stopped — nothing runs on after the call has
  // answered.
  let failed: { error: unknown } | undefined;
  async function pump(): Promise<void> {
    while (true) {
      if (failed) return;
      if (shouldStop?.()) {
        onStop?.();
        return;
      }
      const idx = next++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx]);
      } catch (error) {
        failed ??= { error };
        return;
      }
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => pump()));
  if (failed) throw failed.error;
}

export async function runSearchSource(
  deps: OrchestratorDeps,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  if (!input.query || input.query.length === 0) {
    throw new Error('query must be a non-empty string');
  }
  if (!input.packages || input.packages.length === 0) {
    throw new Error('packages must contain at least one entry');
  }
  if (input.exclude && input.exclude.length > 3) {
    throw new Error('exclude may not contain more than 3 entries');
  }

  const maxHits = input.max_hits_per_object ?? DEFAULTS.max_hits_per_object;
  const maxObjects = input.max_objects ?? DEFAULTS.max_objects;
  const concurrency = Math.min(
    16,
    Math.max(1, input.concurrency ?? DEFAULTS.concurrency),
  );
  const emitNoHits = input.emit_no_hits ?? DEFAULTS.emit_no_hits;
  const version = input.version ?? DEFAULTS.version;
  const now = deps.now ?? Date.now;
  const timeBudgetMs =
    input.time_budget_ms != null && input.time_budget_ms > 0
      ? input.time_budget_ms
      : null;
  const deadline = timeBudgetMs != null ? now() + timeBudgetMs : null;
  const deadlinePassed = (): boolean => deadline != null && now() >= deadline;

  const resolvedPackages = await deps.resolvePackages(input.packages);
  const enumerateInput: EnumerateInput = {
    packages: resolvedPackages,
    include_subpackages:
      input.include_subpackages ?? DEFAULTS.include_subpackages,
    object_filter: input.object_filter,
    object_types: input.object_types ?? DEFAULTS.object_types,
  };
  const allTargets =
    resolvedPackages.length === 0
      ? []
      : await enumerateScanTargets(deps.fetchPackageContents, enumerateInput);
  const slice = sliceTargets(allTargets, input.start_at ?? 0, maxObjects);
  const targets = slice.targets;
  const truncatedByMaxObjects = slice.next !== undefined;

  const allHits: SearchHit[] = [];
  const noHits: NoHitEntry[] = [];
  const failures: FailedObject[] = [];
  let sourcesScanned = 0;
  let truncatedByObjectCap = false;
  let timedOut = false;

  await runWithLimit(
    targets,
    concurrency,
    async (target) => {
      let totalForTarget = 0;
      let capHitForTarget = false;
      const targetHits: SearchHit[] = [];

      const units = readSourceUnits(deps.sourceReader, target, version);
      for (;;) {
        let next: IteratorResult<{ include: string; lines: string[] }>;
        try {
          next = await units.next();
        } catch (error) {
          // A read that failed — SAP's refusal, a chain failure — is this
          // object's answer, with its step; the others are scanned on. The
          // hits read before it stay.
          // A credential failure is every item's: it ends the call as it came.
          if (
            isCredentialFailure(error) ||
            (methodFailureOf(error) === undefined &&
              failureOf(error) === undefined)
          )
            throw error;
          failures.push({
            devclass: target.devclass,
            object_type: target.object_type,
            object_name: target.object_name,
            error: thrownEntry(error, 'read source'),
          });
          allHits.push(...targetHits);
          return;
        }
        if (next.done) break;
        const unit = next.value;
        if (deadlinePassed()) {
          timedOut = true;
          break;
        }
        sourcesScanned++;
        const remaining = maxHits - totalForTarget;
        if (remaining <= 0) {
          const probe = scanLines(unit.lines, {
            query: input.query,
            query2: input.query2,
            exclude: input.exclude,
            exclude_comments: input.exclude_comments,
            max_hits: 1,
          });
          if (probe.hits.length > 0) {
            capHitForTarget = true;
            break;
          }
          continue;
        }
        const scan = scanLines(unit.lines, {
          query: input.query,
          query2: input.query2,
          exclude: input.exclude,
          exclude_comments: input.exclude_comments,
          max_hits: remaining,
        });
        for (const h of scan.hits) {
          targetHits.push({
            devclass: target.devclass,
            object_type: target.object_type,
            object_name: target.object_name,
            include: unit.include,
            line: h.line,
            snippet: h.snippet,
          });
        }
        totalForTarget += scan.hits.length;
        if (scan.capped) {
          capHitForTarget = true;
          break;
        }
      }

      if (capHitForTarget) truncatedByObjectCap = true;
      if (targetHits.length === 0 && emitNoHits) {
        noHits.push({
          devclass: target.devclass,
          object_type: target.object_type,
          object_name: target.object_name,
        });
      } else {
        allHits.push(...targetHits);
      }
    },
    () => {
      // onStop may be called by multiple pump coroutines under concurrency > 1; setting a boolean is idempotent.
      timedOut = true;
    },
    deadlinePassed,
  );

  allHits.sort((a, b) => {
    if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
    if (a.object_name !== b.object_name)
      return a.object_name < b.object_name ? -1 : 1;
    if (a.include !== b.include) return a.include < b.include ? -1 : 1;
    return a.line - b.line;
  });

  if (emitNoHits) {
    noHits.sort((a, b) => {
      if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
      if (a.object_type !== b.object_type)
        return a.object_type < b.object_type ? -1 : 1;
      return a.object_name < b.object_name ? -1 : 1;
    });
  }

  const result: OrchestratorResult = {
    results: allHits,
    scanned: {
      packages: resolvedPackages.length,
      objects: targets.length,
      sources: sourcesScanned,
    },
    total_targets: slice.total,
    truncated: {
      by_object_cap: truncatedByObjectCap,
      by_max_objects: truncatedByMaxObjects,
      by_timeout: timedOut,
    },
  };
  if (slice.next !== undefined) result.next_start_at = slice.next;
  if (emitNoHits) result.no_hits = noHits;
  if (failures.length > 0) {
    failures.sort((a, b) => {
      if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
      return a.object_name < b.object_name ? -1 : 1;
    });
    result.failures = failures;
  }
  return result;
}

/** The passed `time_budget_ms` of the batched version, between two phases. */
const PAST_DEADLINE = new Error('time_budget_ms passed');

/** A credential failure in a phase is every item's: it ends the call as it came. */
function endOnCredential(answers: Iterable<PhaseResult<unknown>>): void {
  for (const answer of answers) {
    if (!answer.ok && isCredentialFailure(answer.error)) throw answer.error;
  }
}

/**
 * The batched version of `SearchSource` (spec §11): its independent reads in
 * one ADT batch envelope per phase — (1) the quickSearch of every package
 * mask; (2) the package walk's levels (`walkPackages`: per level the root
 * node structures, then their type nodes); (3) the source reads of the scan
 * targets, up to `max_objects`: the main sources and function group
 * structures, then the function groups' includes and function modules.
 * `time_budget_ms` is checked between phases: once it passed, no further
 * phase is sent, and what was gathered is answered with
 * `truncated.by_timeout`. The answer is assembled by `runSearchSource` over
 * the phases' answers, so the hits, the failures and the limits are the
 * sequential version's.
 */
async function runSearchSourceInPhases(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  if (!input.query || input.query.length === 0) {
    throw new Error('query must be a non-empty string');
  }
  if (!input.packages || input.packages.length === 0) {
    throw new Error('packages must contain at least one entry');
  }
  if (input.exclude && input.exclude.length > 3) {
    throw new Error('exclude may not contain more than 3 entries');
  }
  const maxObjects = input.max_objects ?? DEFAULTS.max_objects;
  const emitNoHits = input.emit_no_hits ?? DEFAULTS.emit_no_hits;
  const version = input.version ?? DEFAULTS.version;
  const deadline =
    input.time_budget_ms != null && input.time_budget_ms > 0
      ? Date.now() + input.time_budget_ms
      : null;
  const deadlinePassed = (): boolean =>
    deadline != null && Date.now() >= deadline;
  const timedOut = (
    packages: number,
    objects: number,
    totalTargets: number,
    next: number | undefined,
  ): OrchestratorResult => {
    const result: OrchestratorResult = {
      results: [],
      scanned: { packages, objects, sources: 0 },
      total_targets: totalTargets,
      truncated: {
        by_object_cap: false,
        by_max_objects: next !== undefined,
        by_timeout: true,
      },
    };
    if (next !== undefined) result.next_start_at = next;
    if (emitNoHits) result.no_hits = [];
    return result;
  };

  // (1) The quickSearch of every package mask.
  const searches = new Map<string, PhaseResult<string[]>>();
  const askedSearches: SearchObjectsArgs[] = [];
  const resolverDeps: PackageResolverDeps = {
    searchObjects: answeredSearch(searches, askedSearches),
  };
  await resolvePackagePatterns(resolverDeps, input.packages);
  if (askedSearches.length > 0) {
    const answered = await searchPackagesInPhase(ctx, askedSearches);
    endOnCredential(answered.values());
    for (const [key, answer] of answered) searches.set(key, answer);
  }
  const resolved = await resolvePackagePatterns(resolverDeps, input.packages);

  // (2) The package walk's levels; the deadline is checked before each.
  const names = resolved.map((name) => name.toUpperCase());
  const levels = batchReader<NodeRequest, unknown>(ctx, (request, connection) =>
    readNode(
      nodeStructureOn(
        ctx,
        createAdtClient(connection, ctx.logger).getUtils(ourUtils),
      ),
      request,
    ),
  );
  let walked: PhaseResult<WalkedItem[]>[];
  try {
    walked =
      names.length === 0
        ? []
        : await walkPackages(
            (requests) =>
              deadlinePassed()
                ? Promise.reject(PAST_DEADLINE)
                : levels(requests),
            names,
            {
              includeSubpackages:
                input.include_subpackages ?? DEFAULTS.include_subpackages,
            },
          );
  } catch (error) {
    if (error === PAST_DEADLINE)
      return timedOut(resolved.length, 0, 0, undefined);
    throw error;
  }
  const fetchPackageContents: PackageContentsFetcher = async (packageName) => {
    const answer = walked[names.indexOf(packageName.toUpperCase())];
    if (answer === undefined) return [];
    if (!answer.ok) throw answer.error;
    return assembleList(packageName, answer.value);
  };
  const enumerateInput: EnumerateInput = {
    packages: resolved,
    include_subpackages:
      input.include_subpackages ?? DEFAULTS.include_subpackages,
    object_filter: input.object_filter,
    object_types: input.object_types ?? DEFAULTS.object_types,
  };
  const allTargets =
    resolved.length === 0
      ? []
      : await enumerateScanTargets(fetchPackageContents, enumerateInput);
  const slice = sliceTargets(allTargets, input.start_at ?? 0, maxObjects);
  const targets = slice.targets;

  // (3) The source reads of the targets: each phase holds the reads the
  // answers so far name — the main sources and function group structures,
  // then the function groups' includes and function modules.
  const sources = new Map<string, PhaseResult<unknown>>();
  let passed = false;
  for (;;) {
    const asked: SourceRead[] = [];
    const naming = answeredReaderDeps(sources, asked);
    for (const target of targets) {
      try {
        for await (const _unit of readSourceUnits(naming, target, version)) {
          // Only the reads it names are wanted here.
        }
      } catch {
        // A failure answered: the scan below answers it.
      }
    }
    const unique = [
      ...new Map(asked.map((read) => [sourceReadKey(read), read])).values(),
    ];
    if (unique.length === 0) break;
    if (deadlinePassed()) {
      passed = true;
      break;
    }
    const answered = await readSourcesInPhase(ctx, unique);
    endOnCredential(answered.values());
    for (const [key, answer] of answered) sources.set(key, answer);
  }
  if (passed && sources.size === 0) {
    return timedOut(resolved.length, targets.length, slice.total, slice.next);
  }

  // The scan, over the phases' answers: the sequential version's own.
  const { time_budget_ms: _budget, ...scanned } = input;
  const result = await runSearchSource(
    {
      fetchPackageContents,
      sourceReader: answeredReaderDeps(sources, [], ctx.logger),
      resolvePackages: async () => resolved,
    },
    { ...scanned, concurrency: 1 },
  );
  result.truncated.by_timeout = passed;
  return result;
}

/**
 * `SearchSource` on the call's connection: the batched version
 * (`runSearchSourceInPhases`), or — where the destination has no
 * communication batch — the sequential version, today's reads one object
 * after another.
 */
export function runSearchSourceWithContext(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  return withSequentialFallback(
    ctx,
    () => runSearchSourceInPhases(ctx, input),
    () => {
      const searchObjects = createPackagePatternResolver(ctx);
      const resolverDeps: PackageResolverDeps = { searchObjects };
      return runSearchSource(
        {
          fetchPackageContents: createPackageContentsFetcher(ctx),
          sourceReader: createSourceReaderDeps(ctx),
          resolvePackages: (entries) =>
            resolvePackagePatterns(resolverDeps, entries),
        },
        input,
      );
    },
  );
}
