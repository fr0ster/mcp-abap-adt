import { isCredentialFailure } from '../answer';
import { appendAll } from '../appendAll';
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
import type { LineMatchStrategy } from './lineMatch';
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

export interface OrchestratorInput {
  query: string;
  query2?: string;
  exclude?: string[];
  packages: string[];
  include_subpackages?: boolean;
  object_filter?: string;
  object_types?: readonly ScanObjectType[];
  exclude_comments?: boolean;
  /** The most hits answered per object; absent, an object's hits are not limited. */
  max_hits_per_object?: number;
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

/**
 * The answer: the hits, and counters of what was done — the packages walked
 * (their own level read), the objects read (at least one source), the
 * sources read and the objects with a hit. What cannot be read is skipped
 * and not counted (DO17).
 */
export interface OrchestratorResult {
  results: SearchHit[];
  scanned: {
    packages: number;
    objects: number;
    sources: number;
    objects_with_hits: number;
  };
  truncated: {
    /** A given `max_hits_per_object` left out an object's further hits. */
    by_object_cap: boolean;
  };
}

export interface OrchestratorDeps {
  /** Which lines of a source are hits: required, the orchestrator has no match of its own. */
  lineMatch: LineMatchStrategy;
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
  concurrency: 8,
  version: DEFAULT_VERSION,
};

/** One target's answer: what it adds to the result. */
interface TargetAnswer {
  hits: SearchHit[];
  capped: boolean;
  /** This object's sources read: none, and the object was not read. */
  sources: number;
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

  // Absent, an object's hits are not limited.
  const maxHits = input.max_hits_per_object;
  const concurrency = Math.min(
    16,
    Math.max(1, input.concurrency ?? DEFAULTS.concurrency),
  );
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
      ? { targets: [], packages: 0 }
      : await enumerateScanTargets(deps.fetchPackageContents, enumerateInput);
  // One run reads every target.
  const targets = enumerated.targets;

  // Every source read, once however many objects name it (DO17: the
  // counters count the work done).
  const sourcesRead = new Set<string>();

  // Each target's answer, by its index.
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

      // A source that cannot be read is skipped by the reader and its other
      // sources are read on; a credential failure is thrown by the reader
      // and ends the call.
      for await (const unit of readSourceUnits(
        deps.sourceReader,
        target,
        version,
      )) {
        sources++;
        sourcesRead.add(unit.source);
        const terms = {
          query: input.query,
          query2: input.query2,
          exclude: input.exclude,
          exclude_comments: input.exclude_comments,
        };
        // A given limit caps the hits answered, never the reads. Past it a
        // source is only probed for a hit, which marks the cap.
        if (maxHits !== undefined && totalForTarget >= maxHits) {
          if (capHitForTarget) continue;
          const probe = deps.lineMatch.match(unit.lines, {
            ...terms,
            max_hits: 1,
          });
          if (probe.hits.length > 0) capHitForTarget = true;
          continue;
        }
        const scan = deps.lineMatch.match(unit.lines, {
          ...terms,
          max_hits:
            maxHits === undefined ? undefined : maxHits - totalForTarget,
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
        if (scan.capped) capHitForTarget = true;
      }

      answers[index] = {
        hits: targetHits,
        capped: capHitForTarget,
        sources,
      };
    },
  );

  const allHits: SearchHit[] = [];
  let objectsRead = 0;
  let objectsWithHits = 0;
  let truncatedByObjectCap = false;
  for (const answer of answers) {
    if (answer === undefined) continue;
    if (answer.sources > 0) objectsRead++;
    if (answer.hits.length > 0) objectsWithHits++;
    if (answer.capped) truncatedByObjectCap = true;
    appendAll(allHits, answer.hits);
  }

  allHits.sort((a, b) => {
    if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
    if (a.object_name !== b.object_name)
      return a.object_name < b.object_name ? -1 : 1;
    if (a.include !== b.include) return a.include < b.include ? -1 : 1;
    return a.line - b.line;
  });

  const result: OrchestratorResult = {
    results: allHits,
    scanned: {
      packages: enumerated.packages,
      objects: objectsRead,
      sources: sourcesRead.size,
      objects_with_hits: objectsWithHits,
    },
    truncated: { by_object_cap: truncatedByObjectCap },
  };
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
 * envelope per round of the masks not resolved yet; (2) the package walk's levels (`walkPackages`: per level the root
 * node structures, then their type nodes), one envelope each; (3) the source
 * reads of every target, in chunks of 300 targets, each chunk's rounds
 * (the objects' own sources and function group structures, then the function
 * groups' includes and function modules) in envelopes of at most
 * `READS_PER_ENVELOPE`, each source once. The answer is assembled by
 * `runSearchSource` over the phases' answers, so the hits, the counters and
 * the limits are the sequential version's.
 */
async function runSearchSourceInPhases(
  ctx: HandlerContext,
  input: OrchestratorInput,
  lineMatch: LineMatchStrategy,
): Promise<OrchestratorResult> {
  checkInput(input);
  const version = input.version ?? DEFAULTS.version;
  // (1) The quickSearch of every package mask, a phase per round: each run
  // of the resolver names the next round of every mask not resolved yet; the
  // phases repeat until a run asks nothing — every mask resolved or refused.
  const searches = new Map<string, PhaseResult<string[]>>();
  let resolution: ResolvedPackages;
  for (;;) {
    const askedSearches: SearchObjectsArgs[] = [];
    resolution = await resolvePackagePatterns(
      { searchObjects: answeredSearch(searches, askedSearches) },
      input.packages,
    );
    if (askedSearches.length === 0) break;
    const answered = await searchPackagesInPhase(ctx, askedSearches);
    endOnCredential(answered.values());
    for (const [key, answer] of answered) searches.set(key, answer);
  }
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
  // Every package whose own level was read: the asked ones' walks together
  // (a package two asked packages reach is counted once, `enumerateScanTargets`).
  const walkedPackages = new Set<string>();
  const walked: PhaseResult<WalkedItem[]>[] =
    names.length === 0
      ? []
      : await walkPackages(levels, names, {
          includeSubpackages:
            input.include_subpackages ?? DEFAULTS.include_subpackages,
          missingLevel: 'refused',
          branchRule: { walked: walkedPackages },
        });
  const fetchPackageContents: PackageContentsFetcher = async (packageName) => {
    const answer = walked[names.indexOf(packageName.toUpperCase())];
    if (answer === undefined) return { items: [], walked: new Set() };
    if (!answer.ok) throw answer.error;
    return {
      items: assembleList(packageName, answer.value),
      walked: walkedPackages,
    };
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
      ? { targets: [], packages: 0 }
      : await enumerateScanTargets(fetchPackageContents, enumerateInput);
  // Every target: the final scan below (`runSearchSource`) reads the same
  // ones, so the reads sent here are the reads it answers from.
  const targets = enumerated.targets;

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
        for await (const _unit of readSourceUnits(naming, target, version)) {
          // Only the reads it names are wanted here; the scan below answers
          // the units.
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
      lineMatch,
      fetchPackageContents,
      sourceReader: answeredReaderDeps(sources, []),
      resolvePackages: async () => resolution,
    },
    { ...input, concurrency: 1 },
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
  lineMatch: LineMatchStrategy,
): Promise<OrchestratorResult> {
  return withSequentialFallback(
    ctx,
    () => runSearchSourceInPhases(ctx, input, lineMatch),
    () => {
      const searchObjects = createPackagePatternResolver(ctx);
      const resolverDeps: PackageResolverDeps = { searchObjects };
      return runSearchSource(
        {
          lineMatch,
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
