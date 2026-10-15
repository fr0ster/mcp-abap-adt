import { type FailureEntry, isCredentialFailure, thrownEntry } from '../answer';
import { failureOf } from '../auth/failures';
import type { HandlerContext } from '../handlers/interfaces';
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
  createPackagePatternResolver,
  type PackageResolverDeps,
  resolvePackagePatterns,
} from './packageResolver';
import {
  createSourceReaderDeps,
  type ReadSourceUnitsDeps,
  readSourceUnits,
  type SourceVersion,
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
  const truncatedByMaxObjects = allTargets.length > maxObjects;
  const targets = truncatedByMaxObjects
    ? allTargets.slice(0, maxObjects)
    : allTargets;

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
    truncated: {
      by_object_cap: truncatedByObjectCap,
      by_max_objects: truncatedByMaxObjects,
      by_timeout: timedOut,
    },
  };
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

export function runSearchSourceWithContext(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
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
}
