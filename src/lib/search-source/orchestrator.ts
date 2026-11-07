import { isCredentialFailure } from '../answer';
import { type PhaseResult, withSequentialFallback } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import {
  assembleList,
  batchReader,
  type NodeAnswer,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  type WalkedItem,
  walkPackages,
} from '../strategies/packageWalk';
import { ourUtils } from '../strategies/resultSets';
import {
  orderedFailures,
  type ScanFailure,
  type SourceFailure,
} from './failures';
import { scanLines } from './lineScanner';
import {
  createPackageContentsFetcher,
  type EnumerateInput,
  enumerateScanTargets,
  type PackageContentsFetcher,
  SCAN_OBJECT_TYPES,
  type ScanObjectType,
} from './packageEnumerator';
import {
  answeredSearch,
  createPackagePatternResolver,
  type PackageResolverDeps,
  type ResolvedPackages,
  resolvePackagePatterns,
  type SearchObjectsArgs,
  searchPackagesInPhase,
} from './packageResolver';
import {
  answeredReaderDeps,
  createSourceReaderDeps,
  noAnsweredReads,
  type Read,
  type ReadSourceUnitsDeps,
  readingOnce,
  readSourcesInPhase,
  readSourceUnits,
  type SourceVersion,
  sourceReadKey,
} from './sourceReader';

export type { OperationFailure, ScanFailure, SourceFailure } from './failures';

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

export interface OrchestratorResult {
  results: SearchHit[];
  no_hits?: NoHitEntry[];
  /** What was not read, beside the others' hits; present only when anything failed. */
  failures?: ScanFailure[];
  scanned: { packages: number; objects: number; sources: number };
  /** The scan targets of the walk, before the slice. */
  total_targets: number;
  /** Present only when targets remain after the slice. Pass it as `start_at` to go on. */
  next_start_at?: number;
  truncated: {
    by_object_cap: boolean;
    by_max_objects: boolean;
  };
}

export interface OrchestratorDeps {
  fetchPackageContents: PackageContentsFetcher;
  sourceReader: ReadSourceUnitsDeps;
  resolvePackages: (entries: string[]) => Promise<ResolvedPackages>;
}

/** The version a search reads when it names none. */
const DEFAULT_VERSION: SourceVersion = 'active';

const DEFAULTS = {
  include_subpackages: true,
  object_types: SCAN_OBJECT_TYPES,
  exclude_comments: false,
  max_hits_per_object: 100,
  emit_no_hits: false,
  max_objects: 500,
  concurrency: 8,
  version: DEFAULT_VERSION,
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

/** One target's answer: what it adds to the result. */
interface TargetAnswer {
  hits: SearchHit[];
  /** Answered in `no_hits` (no hit, no failure, `emit_no_hits` set) instead of `results`. */
  noHit: boolean;
  capped: boolean;
  sources: number;
  failures: SourceFailure[];
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  // A failure the worker does not answer as its item's (a credential
  // failure, a defect) ends the run: no pump takes another item, and the
  // failure is answered once every pump has stopped — nothing runs on after
  // the call has answered.
  let failed: { error: unknown } | undefined;
  async function pump(): Promise<void> {
    while (true) {
      if (failed) return;
      const idx = next++;
      if (idx >= items.length) return;
      const item = items[idx];
      if (item === undefined) return;
      try {
        await worker(item);
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

/** The checks every version of the scan makes before anything is sent. */
function checkInput(input: OrchestratorInput): void {
  if (!input.query || input.query.length === 0) {
    throw new Error('query must be a non-empty string');
  }
  if (!input.packages || input.packages.length === 0) {
    throw new Error('packages must contain at least one entry');
  }
  if (input.exclude && input.exclude.length > 3) {
    throw new Error('exclude may not contain more than 3 entries');
  }
}

export async function runSearchSource(
  deps: OrchestratorDeps,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  checkInput(input);

  const maxHits = input.max_hits_per_object ?? DEFAULTS.max_hits_per_object;
  const maxObjects = input.max_objects ?? DEFAULTS.max_objects;
  const concurrency = Math.min(
    16,
    Math.max(1, input.concurrency ?? DEFAULTS.concurrency),
  );
  const emitNoHits = input.emit_no_hits ?? DEFAULTS.emit_no_hits;
  const version = input.version ?? DEFAULTS.version;

  const resolution = await deps.resolvePackages(input.packages);
  const resolvedPackages = resolution.packages;
  const enumerateInput: EnumerateInput = {
    packages: resolvedPackages,
    include_subpackages:
      input.include_subpackages ?? DEFAULTS.include_subpackages,
    object_filter: input.object_filter,
    object_types: input.object_types ?? DEFAULTS.object_types,
  };
  const enumerated =
    resolvedPackages.length === 0
      ? { targets: [], failures: [] }
      : await enumerateScanTargets(deps.fetchPackageContents, enumerateInput);
  const startAt = input.start_at ?? 0;
  const slice = sliceTargets(enumerated.targets, startAt, maxObjects);
  const targets = slice.targets;

  // Each target's answer, by its index in the slice.
  const answers: Array<TargetAnswer | undefined> = Array.from(
    { length: targets.length },
    () => undefined,
  );

  await runWithLimit(
    targets.map((_, index) => index),
    concurrency,
    async (index) => {
      const target = targets[index];
      if (target === undefined) return;
      let totalForTarget = 0;
      let capHitForTarget = false;
      let sources = 0;
      const targetHits: SearchHit[] = [];
      const targetFailures: SourceFailure[] = [];

      // A source that was not read is this object's failure, and its other
      // sources are read on; a credential failure is thrown by the reader
      // and ends the call.
      for await (const outcome of readSourceUnits(
        deps.sourceReader,
        target,
        version,
      )) {
        if (!outcome.ok) {
          targetFailures.push(outcome.failure);
          continue;
        }
        const unit = outcome.unit;
        sources++;
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

      answers[index] = {
        hits: targetHits,
        noHit:
          targetHits.length === 0 && targetFailures.length === 0 && emitNoHits,
        capped: capHitForTarget,
        sources,
        failures: targetFailures,
      };
    },
  );

  const allHits: SearchHit[] = [];
  const noHits: NoHitEntry[] = [];
  const failures: ScanFailure[] = [
    ...resolution.failures,
    ...enumerated.failures,
  ];
  let sourcesScanned = 0;
  let truncatedByObjectCap = false;
  answers.forEach((answer, index) => {
    const target = targets[index];
    if (answer === undefined || target === undefined) return;
    sourcesScanned += answer.sources;
    if (answer.capped) truncatedByObjectCap = true;
    failures.push(...answer.failures);
    if (answer.noHit) {
      noHits.push({
        devclass: target.devclass,
        object_type: target.object_type,
        object_name: target.object_name,
      });
    } else {
      allHits.push(...answer.hits);
    }
  });

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
      by_max_objects: slice.next !== undefined,
    },
  };
  if (slice.next !== undefined) result.next_start_at = slice.next;
  if (emitNoHits) result.no_hits = noHits;
  if (failures.length > 0) result.failures = orderedFailures(failures);
  return result;
}

/** The most reads one envelope of the source-read phase carries. */
export const READS_PER_ENVELOPE = 300;

/**
 * The targets read together through their rounds: a chunk's first round (one
 * read per target) fills one envelope.
 */
const TARGETS_PER_CHUNK = READS_PER_ENVELOPE;

/** A credential failure in a phase is every item's: it ends the call as it came. */
function endOnCredential(answers: Iterable<PhaseResult<unknown>>): void {
  for (const answer of answers) {
    if (!answer.ok && isCredentialFailure(answer.error)) throw answer.error;
  }
}

/**
 * The batched version of `SearchSource` (spec §11): its independent reads in
 * ADT batch envelopes — (1) the quickSearch of every package mask, one
 * envelope; (2) the package walk's levels (`walkPackages`: per level the root
 * node structures, then their type nodes), one envelope each; (3) the source
 * reads of the slice's targets, in chunks of 300 targets, each chunk's rounds
 * (the objects' own sources and function group structures, then the function
 * groups' includes and function modules) in envelopes of at most
 * `READS_PER_ENVELOPE`, each source once. The answer is assembled by
 * `runSearchSource` over the phases' answers, so the hits, the failures and
 * the limits are the sequential version's.
 */
async function runSearchSourceInPhases(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  checkInput(input);
  const maxObjects = input.max_objects ?? DEFAULTS.max_objects;
  const startAt = input.start_at ?? 0;
  const version = input.version ?? DEFAULTS.version;
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
  const resolution = await resolvePackagePatterns(resolverDeps, input.packages);
  const resolved = resolution.packages;

  // (2) The package walk's levels.
  const names = resolved.map((name) => name.toUpperCase());
  const levels = batchReader<NodeRequest, NodeAnswer>(
    ctx,
    (request, connection) =>
      readNode(
        nodeStructureOn(
          ctx,
          createAdtClient(connection, ctx.logger).getUtils(ourUtils),
        ),
        request,
      ),
  );
  const walked: PhaseResult<WalkedItem[]>[] =
    names.length === 0
      ? []
      : await walkPackages(levels, names, {
          includeSubpackages:
            input.include_subpackages ?? DEFAULTS.include_subpackages,
        });
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
  const enumerated =
    resolved.length === 0
      ? { targets: [], failures: [] }
      : await enumerateScanTargets(fetchPackageContents, enumerateInput);
  // The slice of the final scan below (`runSearchSource`, the same start and
  // the same sorted targets) must stay this one: the reads sent here are the
  // reads of these targets.
  const targets = sliceTargets(enumerated.targets, startAt, maxObjects).targets;

  // (3) The source reads of the targets, in chunks of TARGETS_PER_CHUNK: a
  // chunk is read through all its rounds, each round's reads not answered
  // yet — every source once, whichever objects name it — in envelopes of at
  // most READS_PER_ENVELOPE.
  const sources = noAnsweredReads();
  for (let at = 0; at < targets.length; at += TARGETS_PER_CHUNK) {
    const chunk = targets.slice(at, at + TARGETS_PER_CHUNK);
    for (;;) {
      const asked: Read[] = [];
      const naming = answeredReaderDeps(sources, asked);
      for (const target of chunk) {
        for await (const _outcome of readSourceUnits(naming, target, version)) {
          // Only the reads it names are wanted here; the scan below answers
          // the outcomes.
        }
      }
      const unique = [
        ...new Map(asked.map((read) => [sourceReadKey(read), read])).values(),
      ];
      if (unique.length === 0) break;
      for (let i = 0; i < unique.length; i += READS_PER_ENVELOPE) {
        await readSourcesInPhase(
          ctx,
          unique.slice(i, i + READS_PER_ENVELOPE),
          sources,
        );
      }
    }
  }

  // The scan, over the phases' answers: the sequential version's own.
  return runSearchSource(
    {
      fetchPackageContents,
      sourceReader: answeredReaderDeps(sources, []),
      resolvePackages: async () => resolution,
    },
    { ...input, start_at: startAt, concurrency: 1 },
  );
}

/**
 * `SearchSource` on the call's connection: the batched version
 * (`runSearchSourceInPhases`), or — where the destination has no
 * communication batch — the sequential version, the reads one object after
 * another, each source read once per call (`readingOnce`).
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
          sourceReader: readingOnce(createSourceReaderDeps(ctx)),
          resolvePackages: (entries) =>
            resolvePackagePatterns(resolverDeps, entries),
        },
        input,
      );
    },
  );
}
