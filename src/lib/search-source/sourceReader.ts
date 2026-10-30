import {
  classDocuments,
  functionModuleDocuments,
  includeDocuments,
  programDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { tableCodeOf } from '../adtTypeCode';
import { failureOf } from '../auth/failures';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import {
  type FugrChild,
  functionGroupStructure,
} from '../strategies/functionGroupStructure';
import { ourUtils } from '../strategies/resultSets';
import { carryingFailure, methodFailureOf } from '../strategies/step';
import type { EnumeratedObject, ScanObjectType } from './packageEnumerator';

export type SourceVersion = 'active' | 'inactive';

export interface SourceUnit {
  include: string;
  lines: string[];
}

export type { FugrChild };

export interface ReadSourceUnitsDeps {
  readProgram(
    programName: string,
    version: SourceVersion,
  ): Promise<string | null>;
  readInclude(includeName: string): Promise<string | null>;
  readClassMain(
    className: string,
    version: SourceVersion,
  ): Promise<string | null>;
  fetchFugrStructure(fugrName: string): Promise<FugrChild[]>;
  readFugrFm(fugrName: string, fmName: string): Promise<string | null>;
  logger?: { debug?: (msg: string) => void; warn?: (msg: string) => void };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

async function safe<T>(
  op: () => Promise<T>,
  logger: ReadSourceUnitsDeps['logger'],
  desc: string,
): Promise<T | null> {
  try {
    return await op();
  } catch (e: any) {
    // SAP refused a read, or the chain failed it: the failure as it is, with
    // its step — the scan answers it, it is not skipped as if the source were
    // empty.
    if (methodFailureOf(e) !== undefined || failureOf(e) !== undefined) throw e;
    logger?.debug?.(`[search-source] ${desc} failed: ${e?.message ?? e}`);
    return null;
  }
}

function isViewFm(name: string): boolean {
  return name.length >= 4 && name.slice(0, 4).toUpperCase() === 'VIEW';
}

/** A source of a function group: a function module or an include. */
interface FugrSource {
  kind: 'fm' | 'include';
  name: string;
}

/**
 * What a structure node's source is, read from its `objecturi`: a path under
 * `/fmodules/` is a function module, one under `/includes/` an include —
 * an `FUGR/I` node, or an element (field, module, class…) whose name is the
 * include it lies in. Any other address (a screen, a GUI status or title:
 * `/sap/bc/adt/vit/wb/…`) has no source. A node without `objecturi` is read
 * by its type: `FUGR/FF` a function module, `FUGR/I` an include.
 */
function fugrSourceOf(child: FugrChild): FugrSource | undefined {
  const uri = child.objecturi;
  if (uri !== undefined && uri !== '') {
    const hash = uri.indexOf('#');
    const path = hash === -1 ? uri : uri.slice(0, hash);
    if (path.includes('/fmodules/'))
      return { kind: 'fm', name: child.objectname };
    if (path.includes('/includes/'))
      return { kind: 'include', name: child.objectname };
    return undefined;
  }
  const code = tableCodeOf(child.objecttype);
  if (code === 'FUGR/FF') return { kind: 'fm', name: child.objectname };
  if (code === 'FUGR/I') return { kind: 'include', name: child.objectname };
  return undefined;
}

/** Function modules first, then includes, each by name. */
function sortFugrSources(sources: FugrSource[]): FugrSource[] {
  return [...sources].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'fm' ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

export async function* readSourceUnits(
  deps: ReadSourceUnitsDeps,
  target: EnumeratedObject,
  version: SourceVersion = 'active',
): AsyncGenerator<SourceUnit> {
  const logger = deps.logger;
  switch (target.object_type as ScanObjectType) {
    case 'PROG': {
      const src = await safe(
        () => deps.readProgram(target.object_name, version),
        logger,
        `read PROG ${target.object_name}`,
      );
      if (src !== null && src !== undefined) {
        yield { include: target.object_name, lines: splitLines(src) };
      }
      return;
    }
    case 'CLAS': {
      const src = await safe(
        () => deps.readClassMain(target.object_name, version),
        logger,
        `read CLAS ${target.object_name}`,
      );
      if (src !== null && src !== undefined) {
        yield { include: target.object_name, lines: splitLines(src) };
      }
      return;
    }
    case 'FUGR': {
      const children = await safe(
        () => deps.fetchFugrStructure(target.object_name),
        logger,
        `fetch FUGR structure ${target.object_name}`,
      );
      if (!children) return;
      // One read per source: an include is named by every element inside
      // it, so the structure lists it under several types.
      const seen = new Set<string>();
      const sources: FugrSource[] = [];
      for (const c of children) {
        if (!c.objecttype.startsWith('FUGR/')) continue;
        const source = fugrSourceOf(c);
        if (source === undefined) continue;
        if (source.kind === 'fm' && isViewFm(source.name)) continue;
        const key = `${source.kind}|${source.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push(source);
      }
      for (const c of sortFugrSources(sources)) {
        const src =
          c.kind === 'fm'
            ? await safe(
                () => deps.readFugrFm(target.object_name, c.name),
                logger,
                `read FUGR/FF ${target.object_name}/${c.name}`,
              )
            : await safe(
                () => deps.readInclude(c.name),
                logger,
                `read FUGR include ${c.name}`,
              );
        if (src !== null && src !== undefined) {
          yield { include: c.name, lines: splitLines(src) };
        }
      }
      return;
    }
  }
}

/**
 * A failed read: a source that is not there (`404`) is skipped as before;
 * any other refusal is thrown as the method's error, with the step.
 */
function refusedOrAbsent(
  answer: { ok: false; getError(): IAdtError },
  step: string,
): null {
  const error = answer.getError();
  if (error.response?.status === 404) return null;
  throw carryingFailure(new Error(error.message), error, step);
}

export function createSourceReaderDeps(
  ctx: HandlerContext,
): ReadSourceUnitsDeps {
  const client = createAdtClient(ctx.connection, ctx.logger);
  return {
    // `read()`/`getObjectStructure()` now answer `IAdtResponse<string>` (the
    // 19.0.0 envelope) instead of the old transport frame with `.readResult`/
    // `.data` on it — both defaulted to `rawDocument`, the document as it
    // arrived, exactly what `.readResult.data`/`.data` used to hand back. No
    // `analyse` strategy is passed: a refusal (missing object, no access) now
    // answers `ok: false` instead of throwing, and is read that way below
    // rather than relying on the outer `try/catch` — `safe()` still catches a
    // genuine throw (a connection failure), but a refusal is no longer one.
    async readProgram(programName, version) {
      const r = await client
        .getProgram(programDocuments)
        .read({ programName }, version, { analyse: analyseException });
      return r.ok ? r.getResult().value : refusedOrAbsent(r, 'read program');
    },
    async readInclude(includeName) {
      // The include endpoint has no version selector: none is sent, as before.
      const r = await client
        .getInclude(includeDocuments)
        .read({ includeName }, undefined, { analyse: analyseException });
      return r.ok ? r.getResult().value : refusedOrAbsent(r, 'read include');
    },
    async readClassMain(className, version) {
      const r = await client
        .getClass(classDocuments)
        .read({ className }, version, { analyse: analyseException });
      return r.ok ? r.getResult().value : refusedOrAbsent(r, 'read class');
    },
    async fetchFugrStructure(fugrName) {
      const r = await client
        .getUtils({ ...ourUtils, objectStructure: functionGroupStructure })
        .getObjectStructure('FUGR/F', fugrName, { analyse: analyseException });
      if (r.ok) return r.getResult().value;
      refusedOrAbsent(r, 'read function group structure');
      return [];
    },
    async readFugrFm(fugrName, fmName) {
      const r = await client
        .getFunctionModule(functionModuleDocuments)
        .read(
          { functionGroupName: fugrName, functionModuleName: fmName },
          undefined,
          { analyse: analyseException },
        );
      return r.ok
        ? r.getResult().value
        : refusedOrAbsent(r, 'read function module');
    },
    logger: ctx.logger,
  };
}

/** One read of the source reader: its method and its arguments. */
export type SourceRead =
  | { method: 'readProgram'; name: string; version: SourceVersion }
  | { method: 'readClassMain'; name: string; version: SourceVersion }
  | { method: 'readInclude'; name: string }
  | { method: 'fetchFugrStructure'; name: string }
  | { method: 'readFugrFm'; group: string; name: string };

/** The key of one read: its method and its arguments. */
export function sourceReadKey(read: SourceRead): string {
  switch (read.method) {
    case 'readProgram':
    case 'readClassMain':
      return `${read.method}|${read.name}|${read.version}`;
    case 'readFugrFm':
      return `${read.method}|${read.group}|${read.name}`;
    default:
      return `${read.method}|${read.name}`;
  }
}

/**
 * `ReadSourceUnitsDeps` answering from `answers`, for the batched version of
 * `SearchSource` (spec §11): a read answered there gives its value (or throws
 * its failure, as it came); a read with no answer is recorded in `asked` and
 * gives nothing — no source, no function group child. `readSourceUnits` run
 * over it names the reads of the next phase; run once every phase answered,
 * it yields the units exactly as over the connection.
 */
export function answeredReaderDeps(
  answers: ReadonlyMap<string, PhaseResult<unknown>>,
  asked: SourceRead[],
  logger?: ReadSourceUnitsDeps['logger'],
): ReadSourceUnitsDeps {
  const answer = async <T>(read: SourceRead, none: T): Promise<T> => {
    const found = answers.get(sourceReadKey(read));
    if (found === undefined) {
      asked.push(read);
      return none;
    }
    if (!found.ok) throw found.error;
    return found.value as T;
  };
  return {
    readProgram: (name, version) =>
      answer<string | null>({ method: 'readProgram', name, version }, null),
    readClassMain: (name, version) =>
      answer<string | null>({ method: 'readClassMain', name, version }, null),
    readInclude: (name) =>
      answer<string | null>({ method: 'readInclude', name }, null),
    fetchFugrStructure: (name) =>
      answer<FugrChild[]>({ method: 'fetchFugrStructure', name }, []),
    readFugrFm: (group, name) =>
      answer<string | null>({ method: 'readFugrFm', group, name }, null),
    ...(logger !== undefined ? { logger } : {}),
  };
}

/** `read` on `deps`: one call of its method. */
function perform(
  deps: ReadSourceUnitsDeps,
  read: SourceRead,
): Promise<unknown> {
  switch (read.method) {
    case 'readProgram':
      return deps.readProgram(read.name, read.version);
    case 'readClassMain':
      return deps.readClassMain(read.name, read.version);
    case 'readInclude':
      return deps.readInclude(read.name);
    case 'fetchFugrStructure':
      return deps.fetchFugrStructure(read.name);
    case 'readFugrFm':
      return deps.readFugrFm(read.group, read.name);
  }
}

/**
 * Every read of `reads` in one ADT batch envelope (`runPhase`), each through
 * the source reader over the phase's batch connection; the answers keyed for
 * `answeredReaderDeps`.
 */
export async function readSourcesInPhase(
  ctx: HandlerContext,
  reads: readonly SourceRead[],
): Promise<Map<string, PhaseResult<unknown>>> {
  const results = await runPhase(ctx, reads, (read, connection) =>
    perform(createSourceReaderDeps({ ...ctx, connection }), read),
  );
  return new Map(
    reads.map((read, i) => [
      sourceReadKey(read),
      results[i] as PhaseResult<unknown>,
    ]),
  );
}
