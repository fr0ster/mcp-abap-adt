import type { AdtCodes } from '../adtProjections';
import { appendAll } from '../appendAll';
import {
  type PhaseResult,
  runPhaseOutcome,
  withSequentialFallback,
} from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import {
  assembleList,
  type LevelReader,
  type NodeAnswer,
  type NodeRequest,
  nodeStructureOn,
  readNode,
  type WalkedItem,
  walkPackages,
} from '../strategies/packageWalk';
import { ourUtils } from '../strategies/resultSets';
import type { AnswerLevel } from './answerLevel';
import type { LineMatchStrategy } from './lineMatch';
import {
  createPackageContentsFetcher,
  type EnumeratedObject,
  type EnumerateInput,
  enumerateScanTargets,
  type PackageContentsFetcher,
  SCAN_OBJECT_TYPES,
  type ScanCode,
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
  envelopeFailure,
  failedRead,
  type SapAnswerStrategy,
} from './readFailure';
import {
  answeredReaderDeps,
  createSourceReaderDeps,
  type GroupMember,
  noAnsweredReads,
  type Read,
  type ReadSourceUnitsDeps,
  readingOnce,
  readSourcesInPhase,
  readSourceUnits,
  type SourceUnit,
  type SourceVersion,
  sourceReadKey,
} from './sourceReader';

export interface OrchestratorInput {
  query: string;
  query2?: string | undefined;
  exclude?: string[] | undefined;
  packages: string[];
  include_subpackages?: boolean | undefined;
  object_filter?: string | undefined;
  object_types?: readonly ScanObjectType[] | undefined;
  exclude_comments?: boolean | undefined;
  /** The most hits answered per object; absent, an object's hits are not limited. */
  max_hits_per_object?: number | undefined;
  /** The most hits of the whole answer; reached, the scan stops. Absent, no limit. */
  max_hits?: number | undefined;
  /** What each hit is answered as (`snippets` when absent). */
  answer?: AnswerLevel | undefined;
  concurrency?: number | undefined;
  version?: SourceVersion | undefined;
}

/**
 * The type a hit of a scanned object is answered under: its main type, or
 * its ADT code where the main type is read by two tools (DO27): a program
 * `PROG`, a program include `PROG/I`.
 */
export type ObjectHitType = ScanObjectType | AdtCodes<'PROG/I'>;

/** A hit's type by the code its object was listed under. */
const HIT_TYPE_OF: Readonly<Record<ScanCode, ObjectHitType>> = {
  'PROG/P': 'PROG',
  'PROG/I': 'PROG/I',
  'CLAS/OC': 'CLAS',
  'INTF/OI': 'INTF',
  'FUGR/F': 'FUGR',
  'DDLS/DF': 'DDLS',
  'BDEF/BDO': 'BDEF',
  'DDLX/EX': 'DDLX',
  'SRVD/SRV': 'SRVD',
};

/** A hit in a source of a scanned object: its include names the source. */
export interface ObjectHit {
  devclass: string;
  object_type: ObjectHitType;
  object_name: string;
  include: string;
  line: number;
  snippet: string;
}

/**
 * A hit in a module or an include addressed under a function group, its own
 * object (DO18, DO27), answered under its ADT code (`FUGR/FF`, `FUGR/I`, as
 * the group's node structure names them): its name and its group — what
 * `GetFunctionModule` and `GetFunctionInclude` take —, no include.
 */
export interface GroupMemberHit {
  devclass: string;
  object_type: AdtCodes<'FUGR/FF' | 'FUGR/I'>;
  object_name: string;
  function_group_name: string;
  line: number;
  snippet: string;
}

export type SearchHit = ObjectHit | GroupMemberHit;

/** A hit answered at the `lines` level: no snippet. */
export type LineHit =
  | Omit<ObjectHit, 'snippet'>
  | Omit<GroupMemberHit, 'snippet'>;

/** One object and include with hits, at the `objects` level: the hits answered for it. */
export type ObjectEntry =
  | (Omit<ObjectHit, 'line' | 'snippet'> & { hits: number })
  | (Omit<GroupMemberHit, 'line' | 'snippet'> & { hits: number });

/** The hits as the level asks them. */
function answeredAs(
  level: AnswerLevel,
  hits: readonly SearchHit[],
): SearchHit[] | LineHit[] | ObjectEntry[] {
  switch (level) {
    case 'snippets':
      return [...hits];
    case 'lines':
      return hits.map((hit): LineHit => {
        const { snippet: _snippet, ...line } = hit;
        return line;
      });
    case 'objects': {
      const entries = new Map<string, ObjectEntry>();
      for (const hit of hits) {
        const { line: _line, snippet: _snippet, ...object } = hit;
        const key = JSON.stringify(object);
        const found = entries.get(key);
        if (found !== undefined) found.hits += 1;
        else entries.set(key, { ...object, hits: 1 });
      }
      return [...entries.values()];
    }
    default: {
      const unreachable: never = level;
      return unreachable;
    }
  }
}

/**
 * The answer: the hits, and counters of what was done — the objects read (at
 * least one source), the sources read and the objects with a hit. What
 * cannot be read is skipped and not counted (DO17). No package is counted
 * (DO26): SAP answers a package that does not exist as an empty one.
 */
export interface OrchestratorResult {
  results: SearchHit[] | LineHit[] | ObjectEntry[];
  scanned: {
    objects: number;
    sources: number;
    objects_with_hits: number;
  };
  truncated: {
    /** A given `max_hits_per_object` left out an object's further hits. */
    by_object_cap: boolean;
    /** Present when `max_hits` was given: the scan stopped with anything left. */
    by_max_hits?: boolean;
  };
}

export interface OrchestratorDeps {
  /** Which lines of a source are hits: required, the orchestrator has no match of its own. */
  lineMatch: LineMatchStrategy;
  /** What a SAP answer to a failed read leads to (DO22): required, the orchestrator has no rule of its own. */
  sapAnswers: SapAnswerStrategy;
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

/** A hit's include, for the order of the answer: a group member's hit has none. */
function includeOf(hit: SearchHit): string {
  return 'include' in hit ? hit.include : '';
}

/** One object's answer: what it adds to the result. */
interface ObjectAnswer {
  hits: SearchHit[];
  capped: boolean;
  /** This object's sources read: none, and the object was not read. */
  sources: number;
  /** The hits answered so far, against `max_hits_per_object`. */
  total: number;
  /** The program include this object is (DO28), by its call-wide key; `undefined` for any other object. */
  programInclude: string | undefined;
}

/**
 * The program include a unit of `target` is (DO28): a `PROG/I` node read as
 * its own target, or a `/programs/includes/` include a function group lists
 * — one object of the call, keyed by its name, however many list it.
 */
function programIncludeOf(
  target: EnumeratedObject,
  unit: SourceUnit,
): string | undefined {
  if (unit.member !== undefined) {
    return unit.member.object_type === 'PROG/I'
      ? unit.member.name.toUpperCase()
      : undefined;
  }
  return target.code === 'PROG/I'
    ? target.object_name.toUpperCase()
    : undefined;
}

async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  stopped: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  // A failure the worker does not answer as its item's (a credential
  // failure, a defect) ends the run: no pump takes another item, and the
  // failure is answered once every pump has stopped — nothing runs on after
  // the call has answered.
  let failed: { error: unknown } | undefined;
  async function pump(): Promise<void> {
    while (true) {
      if (failed || stopped()) return;
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
  // Absent, the answer's hits are not limited. Given, the hits count in the
  // scan's order, so the targets are read one after another.
  const maxTotal = input.max_hits;
  const concurrency =
    maxTotal !== undefined
      ? 1
      : Math.min(16, Math.max(1, input.concurrency ?? DEFAULTS.concurrency));
  // The hits answered so far, and whether the scan stopped at `max_hits`.
  let answered = 0;
  let stopped = false;
  let stoppedWithMore = false;
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
      ? { targets: [] }
      : await enumerateScanTargets(deps.fetchPackageContents, enumerateInput);
  // One run reads every target.
  const targets = enumerated.targets;

  // Every source read, once however many objects name it (DO17: the
  // counters count the work done).
  const sourcesRead = new Set<string>();

  // Each program include of the call is one object (DO28): the position of
  // the target whose occurrence answers it — the first in walk order seen so
  // far. A later occurrence adds nothing; an earlier one finishing later
  // takes it over, and only the first in walk order is answered below.
  const includeOwners = new Map<string, number>();

  // Each target's answer, by its index.
  const answers: Array<ObjectAnswer[] | undefined> = Array.from(
    { length: targets.length },
    () => undefined,
  );

  await runWithLimit(
    targets.map((_, index) => index),
    concurrency,
    async (index) => {
      if (stopped) return;
      const target = targets[index];
      if (target === undefined) return;
      // Each object of the target its own bookkeeping (DO18, DO27): the
      // target itself, and every module and include read under it.
      const objects = new Map<string, ObjectAnswer>();
      const objectOf = (
        unit: SourceUnit,
        programInclude: string | undefined,
      ): ObjectAnswer => {
        const key =
          unit.member === undefined
            ? ''
            : `${unit.member.object_type}|${unit.member.name}`;
        const found = objects.get(key);
        if (found !== undefined) return found;
        const created: ObjectAnswer = {
          hits: [],
          capped: false,
          sources: 0,
          total: 0,
          programInclude,
        };
        objects.set(key, created);
        return created;
      };
      const memberHit = (
        member: GroupMember,
        line: number,
        snippet: string,
      ): SearchHit =>
        member.object_type === 'PROG/I'
          ? {
              devclass: target.devclass,
              object_type: member.object_type,
              object_name: member.name,
              include: member.name,
              line,
              snippet,
            }
          : {
              devclass: target.devclass,
              object_type: member.object_type,
              object_name: member.name,
              function_group_name: member.group,
              line,
              snippet,
            };
      const hitOf = (
        unit: SourceUnit,
        line: number,
        snippet: string,
      ): SearchHit =>
        unit.member === undefined
          ? {
              devclass: target.devclass,
              object_type: HIT_TYPE_OF[target.code],
              object_name: target.object_name,
              include: unit.include,
              line,
              snippet,
            }
          : memberHit(unit.member, line, snippet);

      // A source that cannot be read is skipped by the reader and its other
      // sources are read on; any other outcome of a failed read leaves the
      // reader as decided (`failedRead`).
      for await (const unit of readSourceUnits(
        deps.sourceReader,
        target,
        version,
        deps.sapAnswers,
      )) {
        // A program include an earlier target answers: nothing here — no
        // hit, no count, no room of `max_hits` (the read was the call's one).
        const programInclude = programIncludeOf(target, unit);
        if (programInclude !== undefined) {
          const owner = includeOwners.get(programInclude);
          if (owner !== undefined && owner < index) continue;
          includeOwners.set(programInclude, index);
        }
        const object = objectOf(unit, programInclude);
        object.sources++;
        sourcesRead.add(unit.source);
        const terms = {
          query: input.query,
          query2: input.query2,
          exclude: input.exclude,
          exclude_comments: input.exclude_comments,
        };
        // A given limit caps the hits answered, never the reads. Past it a
        // source is only probed for a hit, which marks the cap.
        if (maxHits !== undefined && object.total >= maxHits) {
          if (object.capped) continue;
          const probe = deps.lineMatch.match(unit.lines, {
            ...terms,
            max_hits: 1,
          });
          if (probe.hits.length > 0) object.capped = true;
          continue;
        }
        const ownRoom =
          maxHits === undefined ? undefined : maxHits - object.total;
        const answerRoom =
          maxTotal === undefined ? undefined : maxTotal - answered;
        const room =
          ownRoom === undefined
            ? answerRoom
            : answerRoom === undefined
              ? ownRoom
              : Math.min(ownRoom, answerRoom);
        const scan = deps.lineMatch.match(unit.lines, {
          ...terms,
          max_hits: room,
        });
        for (const h of scan.hits) {
          object.hits.push(hitOf(unit, h.line, h.snippet));
        }
        object.total += scan.hits.length;
        answered += scan.hits.length;
        // A capped match is the object's cap, unless the answer's
        // `max_hits` was the tighter room (then `by_max_hits` tells it).
        if (
          scan.capped &&
          (answerRoom === undefined ||
            (ownRoom !== undefined && ownRoom <= answerRoom))
        ) {
          object.capped = true;
        }
        // The answer holds `max_hits`: the scan stops, with anything left —
        // a further hit of this source, a source or a target not read.
        if (maxTotal !== undefined && answered >= maxTotal) {
          stopped = true;
          stoppedWithMore =
            scan.capped || !unit.last || index < targets.length - 1;
          break;
        }
      }

      answers[index] = [...objects.values()];
    },
    () => stopped,
  );

  const allHits: SearchHit[] = [];
  let objectsRead = 0;
  let objectsWithHits = 0;
  let truncatedByObjectCap = false;
  for (const [index, answer] of answers.entries()) {
    for (const object of answer ?? []) {
      // A program include answered by the first occurrence in walk order only.
      if (
        object.programInclude !== undefined &&
        includeOwners.get(object.programInclude) !== index
      ) {
        continue;
      }
      if (object.sources > 0) objectsRead++;
      if (object.hits.length > 0) objectsWithHits++;
      if (object.capped) truncatedByObjectCap = true;
      appendAll(allHits, object.hits);
    }
  }

  allHits.sort((a, b) => {
    if (a.devclass !== b.devclass) return a.devclass < b.devclass ? -1 : 1;
    if (a.object_name !== b.object_name)
      return a.object_name < b.object_name ? -1 : 1;
    const x = includeOf(a);
    const y = includeOf(b);
    if (x !== y) return x < y ? -1 : 1;
    return a.line - b.line;
  });

  const result: OrchestratorResult = {
    results: answeredAs(input.answer ?? 'snippets', allHits),
    scanned: {
      objects: objectsRead,
      sources: sourcesRead.size,
      objects_with_hits: objectsWithHits,
    },
    truncated:
      maxTotal === undefined
        ? { by_object_cap: truncatedByObjectCap }
        : { by_object_cap: truncatedByObjectCap, by_max_hits: stoppedWithMore },
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

/** The strategies a `SearchSource` call runs with: the line match and the SAP-answer one. */
export interface SearchSourceStrategies {
  lineMatch: LineMatchStrategy;
  sapAnswers: SapAnswerStrategy;
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
  strategies: SearchSourceStrategies,
): Promise<OrchestratorResult> {
  checkInput(input);
  const { lineMatch, sapAnswers } = strategies;
  const version = input.version ?? DEFAULTS.version;
  // (1) The quickSearch of every package mask, a phase per round: each run
  // of the resolver names the next round of every mask not resolved yet; the
  // phases repeat until a run asks nothing — every mask resolved or refused.
  const searches = new Map<string, PhaseResult<string[]>>();
  let resolution: ResolvedPackages;
  for (;;) {
    const askedSearches: SearchObjectsArgs[] = [];
    resolution = await resolvePackagePatterns(
      {
        searchObjects: answeredSearch(searches, askedSearches),
        sapAnswers,
      },
      input.packages,
    );
    if (askedSearches.length === 0) break;
    const answered = await searchPackagesInPhase(ctx, askedSearches);
    for (const [key, answer] of answered) searches.set(key, answer);
  }
  const resolved = resolution.packages;

  // (2) The package walk's levels.
  const names = resolved.map((name) => name.toUpperCase());
  // Each level in one envelope; a failed envelope is decided here, once,
  // before any part reaches the walk.
  const levels: LevelReader<NodeRequest, NodeAnswer> = async (requests) => {
    const { results, envelope } = await runPhaseOutcome(
      ctx,
      requests,
      (request, connection) =>
        readNode(
          nodeStructureOn(
            ctx,
            createAdtClient(connection, ctx.logger).getUtils(ourUtils),
          ),
          request,
        ),
    );
    if (envelope.failed) envelopeFailure(envelope.error);
    return results;
  };
  const walked: PhaseResult<WalkedItem[]>[] =
    names.length === 0
      ? []
      : await walkPackages(levels, names, {
          includeSubpackages:
            input.include_subpackages ?? DEFAULTS.include_subpackages,
          missingLevel: 'refused',
          branchRule: {
            onFailure: (failure, place) =>
              failedRead(sapAnswers, failure, place),
          },
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
      ? { targets: [] }
      : await enumerateScanTargets(fetchPackageContents, enumerateInput);
  // Every target: the final scan below (`runSearchSource`) reads the same
  // ones, so the reads sent here are the reads it answers from.
  const targets = enumerated.targets;

  // (3) The source reads of the targets, in chunks of TARGETS_PER_CHUNK: a
  // chunk is read through all its rounds, each round's reads not answered
  // yet — every source once, whichever objects name it — in envelopes of at
  // most READS_PER_ENVELOPE.
  const sources = noAnsweredReads();
  // The scan over the answers read so far: `runSearchSource` over the
  // phases' answers, the sequential version's own.
  const scanAnswered = (asked: OrchestratorInput) =>
    runSearchSource(
      {
        lineMatch,
        sapAnswers,
        fetchPackageContents,
        sourceReader: answeredReaderDeps(sources, []),
        resolvePackages: async () => resolution,
      },
      { ...asked, concurrency: 1 },
    );
  for (let at = 0; at < targets.length; at += TARGETS_PER_CHUNK) {
    const chunk = targets.slice(at, at + TARGETS_PER_CHUNK);
    for (;;) {
      const asked: Read[] = [];
      const naming = answeredReaderDeps(sources, asked);
      for (const target of chunk) {
        for await (const _unit of readSourceUnits(
          naming,
          target,
          version,
          sapAnswers,
        )) {
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
    // `max_hits` (DO23): the scan stops at a chunk boundary — once the
    // chunks read hold `max_hits` hits, no envelope of a later chunk is sent.
    if (input.max_hits !== undefined) {
      const sofar = await scanAnswered({ ...input, answer: 'snippets' });
      if (sofar.results.length >= input.max_hits) break;
    }
  }

  // The scan, over the phases' answers: the sequential version's own. With
  // `max_hits`, `scanned.sources` counts the sources read — those of the
  // chunk the scan stopped in included, read but not scanned.
  const scanned = await scanAnswered(input);
  if (input.max_hits === undefined) return scanned;
  const read = [...sources.sources.values()].filter(
    (answer) => answer.ok && answer.value.ok,
  ).length;
  return { ...scanned, scanned: { ...scanned.scanned, sources: read } };
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
  strategies: SearchSourceStrategies,
): Promise<OrchestratorResult> {
  const { lineMatch, sapAnswers } = strategies;
  return withSequentialFallback(
    ctx,
    () => runSearchSourceInPhases(ctx, input, strategies),
    () => {
      const searchObjects = createPackagePatternResolver(ctx);
      const resolverDeps: PackageResolverDeps = { searchObjects, sapAnswers };
      return runSearchSource(
        {
          lineMatch,
          sapAnswers,
          fetchPackageContents: createPackageContentsFetcher(ctx, sapAnswers),
          sourceReader: readingOnce(createSourceReaderDeps(ctx)),
          resolvePackages: (entries) =>
            resolvePackagePatterns(resolverDeps, entries),
        },
        input,
      );
    },
  );
}
