import {
  behaviorDefinitionDocuments,
  classDocuments,
  ddlDocuments,
  functionIncludeDocuments,
  functionModuleDocuments,
  includeDocuments,
  interfaceDocuments,
  metadataExtensionDocuments,
  programDocuments,
  serviceDefinitionDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { tableCodeOf } from '../adtTypeCode';
import { isCredentialFailure } from '../answer';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import type { ReadVersion } from '../handlers/readVersion';
import { linesOf } from '../plainText';
import {
  type FugrChild,
  functionGroupStructure,
} from '../strategies/functionGroupStructure';
import { ourUtils } from '../strategies/resultSets';
import { carryingFailure } from '../strategies/step';
import {
  answeredFacts,
  type FailureFacts,
  type SourceFailure,
  type SourceIdentity,
  thrownFacts,
} from './failures';
import type { EnumeratedObject } from './packageEnumerator';

/** The version a source read names: the call's, active by default. */
export type SourceVersion = ReadVersion;

export interface SourceUnit {
  include: string;
  lines: string[];
}

export type { FugrChild };

/** A class's local includes, by the name ADT gives each in its address. */
export type ClassIncludeKind =
  | 'definitions'
  | 'implementations'
  | 'macros'
  | 'testclasses';

/** The four local includes of a class, in the order they are read. */
const CLASS_INCLUDES: readonly ClassIncludeKind[] = [
  'definitions',
  'implementations',
  'macros',
  'testclasses',
];

/** The readers of an object's own source, by name. */
export type NamedReader =
  | 'program'
  | 'include'
  | 'class'
  | 'interface'
  | 'ddl'
  | 'behaviorDefinition'
  | 'metadataExtension'
  | 'serviceDefinition';

/** One source read: its reader, the source's names and the version. */
export type SourceRead =
  | { reader: NamedReader; name: string; version: SourceVersion }
  | {
      reader: 'functionModule' | 'functionInclude';
      group: string;
      name: string;
      version: SourceVersion;
    }
  | {
      reader: 'classInclude';
      name: string;
      include: ClassIncludeKind;
      version: SourceVersion;
    };

/** A function group's structure read: its nodes. */
export interface StructureRead {
  reader: 'functionGroupStructure';
  name: string;
}

/** Any read of the source reader. */
export type Read = SourceRead | StructureRead;

/** A read's answer: its value, or SAP's failed answer as it came. */
export type ReadAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IAdtError };

/**
 * The reads `readSourceUnits` makes. `undefined` is the answer of a read not
 * answered yet: the batched version names its reads first
 * (`answeredReaderDeps`); a reader over a connection always answers.
 */
export interface ReadSourceUnitsDeps {
  readSource(read: SourceRead): Promise<ReadAnswer<string> | undefined>;
  readStructure(
    functionGroup: string,
  ): Promise<ReadAnswer<FugrChild[]> | undefined>;
}

/** The reader over a connection: every read answered. */
export interface SourceReader extends ReadSourceUnitsDeps {
  readSource(read: SourceRead): Promise<ReadAnswer<string>>;
  readStructure(functionGroup: string): Promise<ReadAnswer<FugrChild[]>>;
}

/**
 * A name as it enters an ADT address: lowercased and percent-encoded, as
 * the addresses ADT answers with.
 */
function seg(name: string): string {
  return encodeURIComponent(name.toLowerCase());
}

const ADT = '/sap/bc/adt';

/** A function group's ADT address: the identity of its structure read. */
export function functionGroupUri(group: string): string {
  return `${ADT}/functions/groups/${seg(group)}`;
}

/**
 * The ADT URI of the source a read reads, without the version: the
 * source's identity in the answer and in the call's one-read-per-source
 * cache. The address each reader sends is this one (pinned by test).
 */
export function sourceUriOf(read: SourceRead): string {
  switch (read.reader) {
    case 'program':
      return `${ADT}/programs/programs/${seg(read.name)}/source/main`;
    case 'include':
      return `${ADT}/programs/includes/${seg(read.name)}/source/main`;
    case 'class':
      return `${ADT}/oo/classes/${seg(read.name)}/source/main`;
    case 'classInclude':
      return `${ADT}/oo/classes/${seg(read.name)}/includes/${read.include}`;
    case 'interface':
      return `${ADT}/oo/interfaces/${seg(read.name)}/source/main`;
    case 'ddl':
      return `${ADT}/ddic/ddl/sources/${seg(read.name)}/source/main`;
    case 'behaviorDefinition':
      return `${ADT}/bo/behaviordefinitions/${seg(read.name)}/source/main`;
    case 'metadataExtension':
      return `${ADT}/ddic/ddlx/sources/${seg(read.name)}/source/main`;
    case 'serviceDefinition':
      return `${ADT}/ddic/srvd/sources/${seg(read.name)}/source/main`;
    case 'functionModule':
      return `${functionGroupUri(read.group)}/fmodules/${seg(read.name)}/source/main`;
    case 'functionInclude':
      return `${functionGroupUri(read.group)}/includes/${seg(read.name)}/source/main`;
  }
}

/** The step a failed read names: which read it was. */
const STEP: Readonly<Record<Read['reader'], string>> = {
  program: 'read program',
  include: 'read include',
  class: 'read class',
  classInclude: 'read class include',
  interface: 'read interface',
  ddl: 'read data definition',
  behaviorDefinition: 'read behavior definition',
  metadataExtension: 'read metadata extension',
  serviceDefinition: 'read service definition',
  functionModule: 'read function module',
  functionInclude: 'read function include',
  functionGroupStructure: 'read function group structure',
};

/** The key of one read: the source's URI and the version, or the structure's group. */
export function sourceReadKey(read: Read): string {
  return read.reader === 'functionGroupStructure'
    ? `structure|${read.name.toUpperCase()}`
    : `${sourceUriOf(read)}|${read.version}`;
}

/** What `readSourceUnits` yields: a source read, or a source that was not. */
export type UnitOutcome =
  | { ok: true; unit: SourceUnit }
  | { ok: false; failure: SourceFailure };

/** The failure entry of a source of `target`. */
function sourceFailure(
  target: EnumeratedObject,
  source: SourceIdentity,
  step: string,
  facts: FailureFacts,
): UnitOutcome {
  return {
    ok: false,
    failure: {
      kind: 'source',
      devclass: target.devclass,
      object_type: target.object_type,
      object_name: target.object_name,
      source,
      step,
      ...facts,
    },
  };
}

/** A failed answer as a thrown failure, with its step. */
function thrownOf(error: IAdtError, step: string): Error {
  return carryingFailure(new Error(error.message), error, step);
}

/**
 * A failed answer SAP gave. A credential failure is thrown — it ends the
 * call; any other is the source's failure.
 */
function refused(
  target: EnumeratedObject,
  source: SourceIdentity,
  step: string,
  error: IAdtError,
): UnitOutcome {
  const thrown = thrownOf(error, step);
  if (isCredentialFailure(thrown)) throw thrown;
  return sourceFailure(target, source, step, answeredFacts(error, step));
}

/**
 * One source of `target`, read. `listed`: SAP named the source (the walk,
 * the function group's structure), so a `404` is its failure; a probe read
 * (a class's local include) that SAP answers `404` is a source that is not
 * there, and yields nothing.
 */
async function* readOne(
  deps: ReadSourceUnitsDeps,
  target: EnumeratedObject,
  read: SourceRead,
  unitName: string,
  listed: boolean,
): AsyncGenerator<UnitOutcome> {
  const source: SourceIdentity = { name: read.name, uri: sourceUriOf(read) };
  const step = STEP[read.reader];
  let answer: ReadAnswer<string> | undefined;
  try {
    answer = await deps.readSource(read);
  } catch (error) {
    yield sourceFailure(target, source, step, thrownFacts(error, step));
    return;
  }
  if (answer === undefined) return;
  if (answer.ok) {
    yield {
      ok: true,
      unit: { include: unitName, lines: linesOf(answer.value) },
    };
    return;
  }
  if (!listed && answer.error.response?.status === 404) return;
  yield refused(target, source, step, answer.error);
}

/** A source of a function group's structure: its read. */
interface FugrSource {
  kind: 'fm' | 'include';
  read: SourceRead;
}

/**
 * The name in `path` after `marker`, up to the next `/`: decoded and
 * upper-cased, as SAP names the object. `undefined` when absent.
 */
function segmentAfter(path: string, marker: string): string | undefined {
  const at = path.indexOf(marker);
  if (at < 0) return undefined;
  const rest = path.slice(at + marker.length);
  const end = rest.indexOf('/');
  const raw = end < 0 ? rest : rest.slice(0, end);
  if (raw === '') return undefined;
  try {
    return decodeURIComponent(raw).toUpperCase();
  } catch {
    // An address SAP sent that does not decode: the name as written.
    return raw.toUpperCase();
  }
}

/**
 * What a structure node's source is, read from its `objecturi` — SAP's own
 * address of it: a function module (`…/functions/groups/<g>/fmodules/<f>`),
 * a function include (`…/functions/groups/<g>/includes/<i>`, read through
 * the function include reader) or a program include
 * (`…/programs/includes/<i>`). Any other address (a screen, a GUI status or
 * title: `/sap/bc/adt/vit/wb/…`) has no source. A node without `objecturi`
 * is read by its type: `FUGR/FF` a function module of the group, `FUGR/I`
 * an include by its name.
 */
function fugrSourceOf(
  group: string,
  node: FugrChild,
  version: SourceVersion,
): FugrSource | undefined {
  const uri = node.objecturi;
  if (uri !== undefined && uri !== '') {
    const hash = uri.indexOf('#');
    const path = hash === -1 ? uri : uri.slice(0, hash);
    const owner = segmentAfter(path, '/functions/groups/') ?? group;
    const module = segmentAfter(path, '/fmodules/');
    if (module !== undefined) {
      return {
        kind: 'fm',
        read: { reader: 'functionModule', group: owner, name: module, version },
      };
    }
    if (path.includes('/functions/groups/')) {
      const include = segmentAfter(path, '/includes/');
      if (include === undefined) return undefined;
      return {
        kind: 'include',
        read: {
          reader: 'functionInclude',
          group: owner,
          name: include,
          version,
        },
      };
    }
    const include = segmentAfter(path, '/programs/includes/');
    if (include === undefined) return undefined;
    return {
      kind: 'include',
      read: { reader: 'include', name: include, version },
    };
  }
  const code = tableCodeOf(node.objecttype);
  if (code === 'FUGR/FF') {
    return {
      kind: 'fm',
      read: {
        reader: 'functionModule',
        group,
        name: node.objectname,
        version,
      },
    };
  }
  if (code === 'FUGR/I') {
    return {
      kind: 'include',
      read: { reader: 'include', name: node.objectname, version },
    };
  }
  return undefined;
}

/** Function modules first, then includes, each by name. */
function sortFugrSources(sources: FugrSource[]): FugrSource[] {
  return [...sources].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'fm' ? -1 : 1;
    const x = a.read.name;
    const y = b.read.name;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** The reader of an object's own source, by the code SAP listed it under. */
function ownReaderOf(code: EnumeratedObject['code']): NamedReader | undefined {
  switch (code) {
    case 'PROG/P':
      return 'program';
    case 'PROG/I':
      return 'include';
    case 'CLAS/OC':
      return 'class';
    case 'INTF/OI':
      return 'interface';
    case 'DDLS/DF':
      return 'ddl';
    case 'BDEF/BDO':
      return 'behaviorDefinition';
    case 'DDLX/EX':
      return 'metadataExtension';
    case 'SRVD/SRV':
      return 'serviceDefinition';
    case 'FUGR/F':
      return undefined;
  }
}

/**
 * Every source of `target`, each read at `version`, in order: a source read
 * is a unit, a source SAP refused (or a read that threw) a failure, and the
 * reads go on after it. A credential failure ends the call, thrown.
 */
export async function* readSourceUnits(
  deps: ReadSourceUnitsDeps,
  target: EnumeratedObject,
  version: SourceVersion = 'active',
): AsyncGenerator<UnitOutcome> {
  const own = ownReaderOf(target.code);
  if (own !== undefined) {
    yield* readOne(
      deps,
      target,
      { reader: own, name: target.object_name, version },
      target.object_name,
      true,
    );
    if (own === 'class') {
      for (const include of CLASS_INCLUDES) {
        yield* readOne(
          deps,
          target,
          {
            reader: 'classInclude',
            name: target.object_name,
            include,
            version,
          },
          include,
          false,
        );
      }
    }
    return;
  }

  // A function group: its structure, then every source it names.
  const group = target.object_name;
  const structureSource: SourceIdentity = {
    name: group,
    uri: functionGroupUri(group),
  };
  const structureStep = STEP.functionGroupStructure;
  let structure: ReadAnswer<FugrChild[]> | undefined;
  try {
    structure = await deps.readStructure(group);
  } catch (error) {
    yield sourceFailure(
      target,
      structureSource,
      structureStep,
      thrownFacts(error, structureStep),
    );
    return;
  }
  if (structure === undefined) return;
  if (!structure.ok) {
    yield refused(target, structureSource, structureStep, structure.error);
    return;
  }
  // One read per source: an include is named by every element inside it,
  // so the structure lists it under several types.
  const seen = new Set<string>();
  const sources: FugrSource[] = [];
  for (const node of structure.value) {
    if (!node.objecttype.startsWith('FUGR/')) continue;
    const source = fugrSourceOf(group, node, version);
    if (source === undefined) continue;
    const key = sourceReadKey(source.read);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  for (const source of sortFugrSources(sources)) {
    yield* readOne(deps, target, source.read, source.read.name, true);
  }
}

/** An adt-clients answer as a read's answer. */
function answerOf<T>(response: IAdtResponse<T>): ReadAnswer<T> {
  return response.ok
    ? { ok: true, value: response.getResult().value }
    : { ok: false, error: response.getError() };
}

/**
 * The reader over the context's connection. Every read passes the call's
 * version and `analyseException`, so SAP's refusal answers `ok: false` with
 * SAP's document; a read that throws (the connection, the chain) throws.
 */
export function createSourceReaderDeps(ctx: HandlerContext): SourceReader {
  const client = createAdtClient(ctx.connection, ctx.logger);
  const options = { analyse: analyseException };
  const readClassInclude = async (
    className: string,
    include: ClassIncludeKind,
    version: SourceVersion,
  ): Promise<ReadAnswer<string>> => {
    const config = { className };
    switch (include) {
      case 'definitions':
        return answerOf(
          await client
            .getLocalDefinitions(classDocuments)
            .read(config, version, options),
        );
      case 'implementations':
        return answerOf(
          await client
            .getLocalTypes(classDocuments)
            .read(config, version, options),
        );
      case 'macros':
        return answerOf(
          await client
            .getLocalMacros(classDocuments)
            .read(config, version, options),
        );
      case 'testclasses':
        return answerOf(
          await client
            .getLocalTestClass(classDocuments)
            .read(config, version, options),
        );
    }
  };
  const readSource = async (read: SourceRead): Promise<ReadAnswer<string>> => {
    const { version } = read;
    switch (read.reader) {
      case 'program':
        return answerOf(
          await client
            .getProgram(programDocuments)
            .read({ programName: read.name }, version, options),
        );
      case 'include':
        return answerOf(
          await client
            .getInclude(includeDocuments)
            .read({ includeName: read.name }, version, options),
        );
      case 'class':
        return answerOf(
          await client
            .getClass(classDocuments)
            .read({ className: read.name }, version, options),
        );
      case 'classInclude':
        return readClassInclude(read.name, read.include, version);
      case 'interface':
        return answerOf(
          await client
            .getInterface(interfaceDocuments)
            .read({ interfaceName: read.name }, version, options),
        );
      case 'ddl':
        return answerOf(
          await client
            .getDdl(ddlDocuments)
            .read({ ddlName: read.name }, version, options),
        );
      case 'behaviorDefinition':
        return answerOf(
          await client
            .getBehaviorDefinition(behaviorDefinitionDocuments)
            .read({ name: read.name }, version, options),
        );
      case 'metadataExtension':
        return answerOf(
          await client
            .getMetadataExtension(metadataExtensionDocuments)
            .read({ name: read.name }, version, options),
        );
      case 'serviceDefinition':
        return answerOf(
          await client
            .getServiceDefinition(serviceDefinitionDocuments)
            .read({ serviceDefinitionName: read.name }, version, options),
        );
      case 'functionModule':
        return answerOf(
          await client
            .getFunctionModule(functionModuleDocuments)
            .read(
              { functionGroupName: read.group, functionModuleName: read.name },
              version,
              options,
            ),
        );
      case 'functionInclude':
        return answerOf(
          await client
            .getFunctionInclude(functionIncludeDocuments)
            .read(
              { functionGroupName: read.group, includeName: read.name },
              version,
              options,
            ),
        );
    }
  };
  return {
    readSource,
    async readStructure(functionGroup) {
      return answerOf(
        await client
          .getUtils({ ...ourUtils, objectStructure: functionGroupStructure })
          .getObjectStructure('FUGR/F', functionGroup, options),
      );
    },
  };
}

/**
 * `deps` reading each source once per call: a read already asked answers
 * from the first one — its value, its failure, its throw — so a source two
 * objects name is sent once and answers both.
 */
export function readingOnce(deps: SourceReader): SourceReader {
  const sources = new Map<string, Promise<ReadAnswer<string>>>();
  const structures = new Map<string, Promise<ReadAnswer<FugrChild[]>>>();
  return {
    readSource(read) {
      const key = sourceReadKey(read);
      const found = sources.get(key);
      if (found !== undefined) return found;
      const asked = deps.readSource(read);
      sources.set(key, asked);
      return asked;
    },
    readStructure(functionGroup) {
      const key = sourceReadKey({
        reader: 'functionGroupStructure',
        name: functionGroup,
      });
      const found = structures.get(key);
      if (found !== undefined) return found;
      const asked = deps.readStructure(functionGroup);
      structures.set(key, asked);
      return asked;
    },
  };
}

/** What one read of a phase answers: a source's text or a structure's nodes. */
export type PhaseAnswer =
  | { kind: 'source'; answer: ReadAnswer<string> }
  | { kind: 'structure'; answer: ReadAnswer<FugrChild[]> };

/** The phases' answers, by `sourceReadKey`. */
export interface AnsweredReads {
  sources: Map<string, PhaseResult<ReadAnswer<string>>>;
  structures: Map<string, PhaseResult<ReadAnswer<FugrChild[]>>>;
}

/** An empty set of answers. */
export function noAnsweredReads(): AnsweredReads {
  return { sources: new Map(), structures: new Map() };
}

/**
 * `ReadSourceUnitsDeps` answering from `answers`, for the batched version of
 * `SearchSource` (spec §11): a read answered there gives its answer (or
 * throws what its read threw, as it came); a read with no answer is recorded
 * in `asked` and answers `undefined`. `readSourceUnits` run over it names
 * the reads of the next phase; run once every phase answered, it yields the
 * units and failures exactly as over the connection.
 */
export function answeredReaderDeps(
  answers: AnsweredReads,
  asked: Read[],
): ReadSourceUnitsDeps {
  return {
    async readSource(read) {
      const found = answers.sources.get(sourceReadKey(read));
      if (found === undefined) {
        asked.push(read);
        return undefined;
      }
      if (!found.ok) throw found.error;
      return found.value;
    },
    async readStructure(functionGroup) {
      const read: StructureRead = {
        reader: 'functionGroupStructure',
        name: functionGroup,
      };
      const found = answers.structures.get(sourceReadKey(read));
      if (found === undefined) {
        asked.push(read);
        return undefined;
      }
      if (!found.ok) throw found.error;
      return found.value;
    },
  };
}

/** `read` on `deps`: one call of its reader. */
async function perform(deps: SourceReader, read: Read): Promise<PhaseAnswer> {
  return read.reader === 'functionGroupStructure'
    ? { kind: 'structure', answer: await deps.readStructure(read.name) }
    : { kind: 'source', answer: await deps.readSource(read) };
}

/** The credential failure a phase answer to `read` carries, thrown or answered; `undefined` when none. */
function credentialOf(read: Read, result: PhaseResult<PhaseAnswer>): unknown {
  if (!result.ok) {
    return isCredentialFailure(result.error) ? result.error : undefined;
  }
  const { answer } = result.value;
  if (answer.ok) return undefined;
  const thrown = thrownOf(answer.error, STEP[read.reader]);
  return isCredentialFailure(thrown) ? thrown : undefined;
}

/**
 * Every read of `reads` in one ADT batch envelope (`runPhase`), each through
 * the source reader over the phase's batch connection; the answers added to
 * `answers`. A credential failure ends the call, thrown, before any answer
 * is added.
 */
export async function readSourcesInPhase(
  ctx: HandlerContext,
  reads: readonly Read[],
  answers: AnsweredReads,
): Promise<void> {
  const results = await runPhase(ctx, reads, (read, connection) =>
    perform(createSourceReaderDeps({ ...ctx, connection }), read),
  );
  const answered = reads.map((read, i) => ({ read, result: results[i] }));
  for (const { read, result } of answered) {
    // `runPhase` answers every read it was given, in order.
    if (result === undefined) throw new Error('a phase read was not answered');
    const ended = credentialOf(read, result);
    if (ended !== undefined) throw ended;
  }
  answered.forEach(({ read, result }) => {
    if (result === undefined) return;
    const key = sourceReadKey(read);
    if (!result.ok) {
      if (read.reader === 'functionGroupStructure') {
        answers.structures.set(key, result);
      } else {
        answers.sources.set(key, result);
      }
      return;
    }
    const value = result.value;
    if (value.kind === 'structure') {
      answers.structures.set(key, { ok: true, value: value.answer });
    } else {
      answers.sources.set(key, { ok: true, value: value.answer });
    }
  });
}
