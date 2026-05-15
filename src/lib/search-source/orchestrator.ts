import type { HandlerContext } from '../handlers/interfaces';
import { scanLines } from './lineScanner';
import {
  createPackageContentsFetcher,
  type EnumeratedObject,
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
  scanned: { packages: number; objects: number; sources: number };
  truncated: { by_object_cap: boolean; by_max_objects: boolean };
}

export interface OrchestratorDeps {
  fetchPackageContents: PackageContentsFetcher;
  sourceReader: ReadSourceUnitsDeps;
  resolvePackages: (entries: string[]) => Promise<string[]>;
}

const DEFAULTS = {
  include_subpackages: true,
  object_types: ['PROG', 'FUGR', 'CLAS'] as const,
  exclude_comments: false,
  max_hits_per_object: 1,
  emit_no_hits: false,
  max_objects: 500,
  concurrency: 8,
  version: 'active' as SourceVersion,
};

async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function pump(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      await worker(items[idx]);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => pump()));
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
  let sourcesScanned = 0;
  let truncatedByObjectCap = false;

  await runWithLimit(targets, concurrency, async (target) => {
    let totalForTarget = 0;
    let capHitForTarget = false;
    const targetHits: SearchHit[] = [];

    for await (const unit of readSourceUnits(
      deps.sourceReader,
      target,
      version,
    )) {
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
    truncated: {
      by_object_cap: truncatedByObjectCap,
      by_max_objects: truncatedByMaxObjects,
    },
  };
  if (emitNoHits) result.no_hits = noHits;
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
