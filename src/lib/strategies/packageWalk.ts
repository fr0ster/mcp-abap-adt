import {
  analyseException,
  type IRepositoryIncompleteNode,
  type IRepositoryNodeContents,
  type IRepositoryObjectNode,
} from '@mcp-abap-adt/adt-strategies';
import type {
  AdtTypeCode,
  IAdtAnsweredObject,
  IAdtError,
  IAdtFailure,
  IAdtHeaders,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../handlers/interfaces';
import {
  type AdtAnswer,
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import type { AdtCodes } from '../adtProjections';
import { tableCodeOf } from '../adtTypeCode';
import {
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
} from '../answer';
import { appendAll } from '../appendAll';
import { failureOf } from '../auth/failures';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import { parseXml, type XmlNode } from '../xml/node';
import {
  childAt as nodeAt,
  child as nodeChild,
  entries as nodeEntries,
  listOf as nodeList,
  type XmlRead,
} from '../xml/tree';
import {
  type MetadataRead,
  type MetadataTarget,
  metadataKeyOf,
  metadataReadOf,
} from './metadataReads';
import type { AdtReading } from './reading';
import { atStep, carryingFailure } from './step';

/**
 * The one call this walk needs, named structurally.
 *
 * Not `AdtUtils`: the boundary is that adt-clients wraps ADT calls and this
 * repository makes them convenient for a consumer. Depending on one call rather
 * than on the whole utility says which side of that line this file is on, and
 * keeps it testable without a client.
 */
export interface NodeStructureSourceOf<R> {
  fetchNodeStructure(
    parentType: AdtTypeCode,
    parentName: string,
    options?: {
      nodeId?: string;
      withShortDescriptions?: boolean;
      analyse?: typeof analyseException;
    },
  ): Promise<R>;
}

/** A source of node structure reads, each answer read as a `NodeAnswer`. */
export type NodeStructureSource = NodeStructureSourceOf<NodeAnswer>;

/** What one node structure read answers: the level, as `utilNodeContents` reads it. */
export type NodeAnswer = IAdtResponse<NodeLevel, IAdtError>;

/** The options a node structure read takes, beside its header pair. */
type NodeStructureOptions = {
  nodeId?: string;
  withShortDescriptions?: boolean;
  analyse?: typeof analyseException;
};

/** The utilities' `fetchNodeStructure` as adt-clients declares it: it takes its header pair. */
export interface NodeStructureMembers<R> {
  fetchNodeStructure(
    parentType: AdtTypeCode,
    parentName: string,
    options: { headers: IAdtHeaders } & NodeStructureOptions,
  ): Promise<R>;
}

/**
 * `utils`' node structure read with the header pair of
 * `utils.fetchNodeStructure` for the call's system (`withAdtHeaders`).
 */
export function nodeStructureOn<R extends AdtAnswer>(
  context: AdtHeadersContext,
  utils: NodeStructureMembers<R>,
): {
  fetchNodeStructure(
    parentType: AdtTypeCode,
    parentName: string,
    options?: NodeStructureOptions,
  ): Promise<R>;
} {
  return {
    fetchNodeStructure: (parentType, parentName, options) =>
      withAdtHeaders(context, 'utils.fetchNodeStructure', (headers) =>
        utils.fetchNodeStructure(parentType, parentName, {
          ...options,
          headers,
        }),
      ),
  };
}

/**
 * Reads every item of one level; each item's settlement, in item order.
 * `ownAnswers`: every item's answer is its own request's, as a request sent
 * alone answers it (`concurrentReader`); not so for the parts of an envelope
 * (`batchReader`), whose node structures can carry another part's
 * `DESCRIPTION`.
 */
export type LevelReader<I, R> = ((
  items: readonly I[],
) => Promise<PhaseResult<R>[]>) & { readonly ownAnswers?: boolean };

/**
 * One level's reads in one ADT batch envelope (spec §11): `read(item,
 * connection)` for every item, on the phase's batch connection (`runPhase`).
 */
export function batchReader<I, R>(
  context: HandlerContext,
  read: (item: I, connection: IAbapConnection) => Promise<R>,
): LevelReader<I, R> {
  return (items) => runPhase(context, items, read);
}

/** How many node structure requests `concurrentReader` keeps open at once. */
export const NODE_READ_CONCURRENCY = 8;

/**
 * One level's reads as requests sent alone, `NODE_READ_CONCURRENCY` at a
 * time, on the call's connection: `read(item, connection)` for every item;
 * each item's settlement, in item order. Every answer is its own request's
 * (`ownAnswers`), so a node structure's `DESCRIPTION` is the object's own —
 * which an envelope part's is not (measured on an on-premise system: inside
 * one envelope, the node structure parts after the first answer other parts'
 * texts; sent alone, each answers its own). A failure that ends the call
 * (`endsTheCall`) stops the reads not yet started and is thrown as it came,
 * once the started ones have settled. An answer `stopsAt` accepts — a refusal
 * the read answered rather than threw, such as a `401` read with
 * `analyseException` — stops the reads not yet started too, and is answered
 * in its place: the result then holds the items read, in order, up to the
 * last one started; the items after it have no entry.
 */
export function concurrentReader<I, R>(
  context: HandlerContext,
  read: (item: I, connection: IAbapConnection) => Promise<R>,
  stopsAt?: (value: R) => boolean,
): LevelReader<I, R> {
  const reader = async (items: readonly I[]): Promise<PhaseResult<R>[]> => {
    const out = new Array<PhaseResult<R>>(items.length);
    let next = 0;
    let ended: { error: unknown } | undefined;
    let stopped = false;
    const pump = async (): Promise<void> => {
      while (ended === undefined && !stopped && next < items.length) {
        const at = next++;
        try {
          const value = await read(items[at], context.connection);
          out[at] = { ok: true, value };
          if (stopsAt?.(value)) stopped = true;
        } catch (error) {
          if (endsTheCall(error)) ended ??= { error };
          out[at] = { ok: false, error };
        }
      }
    };
    const pumps = Math.max(1, Math.min(NODE_READ_CONCURRENCY, items.length));
    await Promise.all(Array.from({ length: pumps }, pump));
    if (ended !== undefined) throw ended.error;
    return stopped ? out.slice(0, next) : out;
  };
  return Object.assign(reader, { ownAnswers: true as const });
}

/**
 * Whether a root's failure ends a call that reads several roots: a failure
 * the server's reader answers (a chain failure, the server's own refusal), or
 * a credential failure — a `401` SAP answered included (`isCredentialFailure`).
 */
export function endsTheCall(thrown: unknown): boolean {
  return failureOf(thrown) !== undefined || isCredentialFailure(thrown);
}

/**
 * The sequential version of a call that reads several roots (spec §11: the
 * handler's own code path, where the destination has no communication
 * batch): `read(root)` for one root after another; each root's settlement,
 * in order. A failure that ends the call (`endsTheCall`) is thrown as it
 * came, and no root after it is read.
 */
export async function rootByRoot<I, R>(
  roots: readonly I[],
  read: (root: I) => Promise<R>,
): Promise<PhaseResult<R>[]> {
  const out: PhaseResult<R>[] = [];
  for (const root of roots) {
    try {
      out.push({ ok: true, value: await read(root) });
    } catch (error) {
      if (endsTheCall(error)) throw error;
      out.push({ ok: false, error });
    }
  }
  return out;
}

/** One node structure request of a walk. */
export interface NodeRequest {
  parentType: AdtTypeCode;
  parentName: string;
  nodeId?: string;
  withShortDescriptions: boolean;
  /** Read with `analyseException`: a refusal answered as `ok: false`. */
  analysed?: boolean;
}

/** `request` read on `utils`: one `fetchNodeStructure`. */
export function readNode<R>(
  utils: NodeStructureSourceOf<R>,
  request: NodeRequest,
): Promise<R> {
  return utils.fetchNodeStructure(request.parentType, request.parentName, {
    ...(request.analysed ? { analyse: analyseException } : {}),
    ...(request.nodeId !== undefined ? { nodeId: request.nodeId } : {}),
    withShortDescriptions: request.withShortDescriptions,
  });
}

/**
 * One level of the tree, as adt-strategies reads it (`utilNodeContents`,
 * 0.28.1): the complete objects, the object nodes SAP listed without a name,
 * technical name or URI (`incompleteObjects`), each node SAP could not load
 * (`notLoaded`), and the typed child nodes to ask for next.
 */
export type NodeLevel = IRepositoryNodeContents;

/**
 * An object of a level as the tools answer it: its name, its code (as the
 * tables know it, or as SAP sent it), and its description, technical name
 * and URI where the node carries them.
 */
export interface NodeItem {
  name: string;
  type: string;
  description?: string | undefined;
  techName?: string | undefined;
  uri?: string | undefined;
}

/** A code as the tables know it, or as SAP sent it. */
function codeOf(object: IAdtAnsweredObject): string {
  return object.type ?? object.unknownType;
}

/**
 * Every object a level lists, as the tools answer it: the complete ones,
 * then those SAP listed incomplete — listed, never dropped.
 */
export function nodeItemsOf(level: NodeLevel): NodeItem[] {
  const listed: ReadonlyArray<
    IRepositoryObjectNode | IRepositoryIncompleteNode
  > = [...level.objects, ...(level.incompleteObjects ?? [])];
  return listed.map((object) => ({
    name: object.objectName ?? '',
    type: codeOf(object),
    description: object.description || undefined,
    techName: object.techName || undefined,
    uri: object.objectUri || undefined,
  }));
}

/**
 * The child nodes a level lists, each its code and the id to ask for it by.
 * The document writes the id padded — `000031` — and the request the corpus
 * recorded sends `31`. The system accepts both, verified live, but sending
 * what ADT itself sends keeps the wire comparable with the fixtures and with
 * a trace.
 */
export function childNodesOf(
  level: NodeLevel,
): Array<{ type: string; nodeId: string }> {
  return level.childNodes
    .map((child) => ({
      type: codeOf(child),
      nodeId: String(Number(child.nodeId)),
    }))
    .filter((child) => child.nodeId !== 'NaN');
}

/** Whether SAP answered a level with a node it could not load. */
export function isNotLoaded(level: NodeLevel): boolean {
  return (level.notLoaded ?? []).length > 0;
}

/**
 * The row a walk answers for a type node SAP could not load, beside the
 * node's type: fixed words, nothing of SAP's message.
 */
export const NOT_LOADED_BY_SAP = 'not loaded by SAP';

/** `fetchNodeStructure` answers an IAdtResponse; this is the level inside it. */
function levelOf(
  answer: NodeAnswer,
  missingLevel: MissingLevel = 'empty',
): NodeLevel {
  if (!answer.ok) {
    const error = answer.getError();
    // A level that is not there stays what it was: empty, unless the caller
    // asked for it as a refusal. Any other refusal is the method's error as
    // it is, with the step — not an empty level that reads as "nothing here".
    if (error.response?.status === 404 && missingLevel === 'empty') {
      return { objects: [], childNodes: [] };
    }
    throw carryingFailure(
      new Error(error.message),
      error,
      'read package node structure',
    );
  }
  return answer.getResult().value;
}

/**
 * Walking a package, assembled here rather than in the client.
 *
 * **Which side of the boundary this belongs on.** adt-clients wraps ADT calls;
 * this repository makes them convenient for a language model and for other
 * consumers. A flat list and a tree are two conveniences over the same walk, so
 * the assembly is ours and the request is theirs.
 *
 * `IResultStrategy<T> = (answer) => T` reads ONE answer, so a member that makes
 * many requests cannot have one. `getPackageContentsList` and
 * `getPackageHierarchy` are two such members, and between them they had already
 * made the choice a caller needs to make: flat list, or tree. A third shape
 * would have needed a third member.
 *
 * `fetchNodeStructure` is one request and does have a strategy slot, so the
 * walk is composed of steps that can each be read by an injected reading, and
 * the assembly is the handler's. That is the same shape the other six walking
 * handlers in this repository already use.
 *
 * Filed against the library as mcp-abap-adt-clients#141; this is the local
 * answer while that stands.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

export type PackageItemKind =
  | 'package'
  | 'domain'
  | 'dataElement'
  | 'structure'
  | 'table'
  | 'tableType'
  | 'view'
  | 'metadataExtension'
  | 'class'
  | 'interface'
  | 'program'
  | 'functionModule'
  | 'functionGroup'
  | 'serviceDefinition'
  | 'behaviorDefinition'
  | 'behaviorImplementation';

export type CodeFormat = 'xml' | 'source';

/** One row of a flat listing. */
export interface PackageItem {
  name: string;
  type: string;
  kind?: PackageItemKind;
  description?: string | undefined;
  packageName: string;
  isPackage: boolean;
  /** A type node SAP could not load: its row (`NOT_LOADED_BY_SAP`). */
  notLoaded?: true;
  /**
   * An object SAP listed without a name: the technical name and URI it
   * carries, all that tells it apart (present only then).
   */
  techName?: string;
  uri?: string;
}

/** The code of a package, the root of every tree. */
const PACKAGE_CODE: AdtCodes<'DEVC/K'> = 'DEVC/K';

/** One node of a tree. */
export interface PackageNode {
  name: string;
  type: string;
  kind?: PackageItemKind;
  description?: string | undefined;
  isPackage: boolean;
  codeFormat?: CodeFormat;
  restoreStatus?: 'ok' | 'not-implemented';
  /** A type node SAP could not load: its row (`NOT_LOADED_BY_SAP`). */
  notLoaded?: true;
  /**
   * An object SAP listed without a name: the technical name and URI it
   * carries, all that tells it apart (present only then).
   */
  techName?: string;
  uri?: string;
  children?: PackageNode[];
}

/**
 * The coarse classification of each code of the tables a package listing
 * names: a key outside the tables does not compile. A code SAP answers that
 * no table holds has no kind. An include (`PROG/I`) is classified with the
 * programs, as it always was.
 */
const PACKAGE_ITEM_KINDS: Readonly<
  Partial<Record<AdtTypeCode, PackageItemKind>>
> = {
  'DEVC/K': 'package',
  'DOMA/DD': 'domain',
  'DTEL/DE': 'dataElement',
  'TABL/DS': 'structure',
  'TABL/DT': 'table',
  'TTYP/DA': 'tableType',
  'DDLS/DF': 'view',
  'DDLX/EX': 'metadataExtension',
  'CLAS/OC': 'class',
  'INTF/OI': 'interface',
  'PROG/P': 'program',
  'PROG/I': 'program',
  'FUGR/FF': 'functionModule',
  'FUGR/F': 'functionGroup',
  'SRVD/SRV': 'serviceDefinition',
  'BDEF/BDO': 'behaviorDefinition',
};

/** The coarse classification, from the ADT type code SAP answered. */
export function kindOf(
  adtType: string | undefined,
): PackageItemKind | undefined {
  if (!adtType) return undefined;
  const code = tableCodeOf(adtType);
  return code === undefined ? undefined : PACKAGE_ITEM_KINDS[code];
}

/**
 * Each code's editor content: XML (a package, a domain, a data element, a
 * function group) or source. A code not here has none to name.
 */
const CODE_FORMATS: Readonly<Partial<Record<AdtTypeCode, CodeFormat>>> = {
  'DEVC/K': 'xml',
  'DOMA/DD': 'xml',
  'DTEL/DE': 'xml',
  'FUGR/F': 'xml',
  'CLAS/OC': 'source',
  'INTF/OI': 'source',
  'PROG/P': 'source',
  'PROG/I': 'source',
  'DDLS/DF': 'source',
  'DDLX/EX': 'source',
  'SRVD/SRV': 'source',
  'TABL/DT': 'source',
  'TABL/DS': 'source',
  'TTYP/DA': 'source',
  'FUGR/FF': 'source',
  'BDEF/BDO': 'source',
};

/**
 * Whether the object's editor content is XML or source, by the code of the
 * tables the answer names (`tableCodeOf`). Tree only.
 */
export function codeFormatOf(
  adtType: string | undefined,
): CodeFormat | undefined {
  if (!adtType) return undefined;
  const code = tableCodeOf(adtType);
  return code === undefined ? undefined : CODE_FORMATS[code];
}

const RESTORABLE = new Set<string>([
  'package',
  'domain',
  'dataElement',
  'structure',
  'table',
  'tableType',
  'view',
  'class',
  'interface',
  'program',
  'functionGroup',
  'functionModule',
  'serviceDefinition',
  'metadataExtension',
  'behaviorDefinition',
  'behaviorImplementation',
]);

function textOf(value: XmlRead): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const t = nodeChild(value, '#text');
    if (typeof t === 'string' || typeof t === 'number') return String(t).trim();
  }
  return '';
}

export interface WalkOptions {
  includeSubpackages?: boolean | undefined;
  maxDepth?: number | undefined;
  includeDescriptions?: boolean | undefined;
  /**
   * What a `404` on a level answers: `'empty'` (the default) reads the level
   * as empty; `'refused'` makes it the walk's failure, SAP's answer with its
   * step — for a caller that must name every scope it did not read.
   */
  missingLevel?: MissingLevel | undefined;
  /** A refused level below the root excludes only its branch (`BranchRule`); absent, it ends the package's walk. */
  branchRule?: BranchRule | undefined;
}

/** What a `404` on a level of a walk answers. */
export type MissingLevel = 'empty' | 'refused';

/**
 * The branch rule of a walk that reads what it can (`SearchSource`, DO19): a
 * refused level below the asked package's root — a type node, or a
 * subpackage's root, its `404` included under `missingLevel: 'refused'` —
 * excludes only that branch, and the walk goes on with the next node or
 * subpackage; a refused root of the asked package still settles the package
 * as refused; a credential failure still ends the walk.
 */
export interface BranchRule {
  /**
   * A refused read of the walk, at its place: returns when what the place
   * names is skipped (the package, or the branch below it); throws to end
   * the walk. Every failed level, the root's included, is handed here.
   */
  onFailure(failure: unknown, place: WalkFailurePlace): void;
}

/** Where a walk's read failed: the asked package's root, or a level below it. */
export type WalkFailurePlace =
  | { kind: 'package'; package: string }
  | {
      kind: 'level';
      package: string;
      /** The refused subpackage, or the refused type node. */
      level: { subpackage: string } | { node: { id: string; type: string } };
    };

/** A package of a walk: what was found in it, and the subpackages walked from it. */
interface PackageWalk {
  root: number;
  name: string;
  depth: number;
  found: WalkedItem[];
  subs: PackageWalk[];
}

/**
 * An object of a batched level, found in `packageName`, without the
 * description its part carried: a node structure part after the first of an
 * envelope can carry another part's `DESCRIPTION` (measured, 2026-10-18), so
 * a walk that answers descriptions reads its levels with `concurrentReader`.
 */
function undescribed(object: NodeItem, packageName: string): WalkedItem {
  const { description: _part, ...rest } = object;
  return { ...rest, packageName };
}

/**
 * An object's identity within one package: every identity field it carries —
 * its type, its name, its technical name and its URI — so objects SAP lists
 * without a name stay apart; every field read as SAP's repository reads it,
 * in any case.
 */
function listedKeyOf(object: WalkedItem): string {
  return [
    object.type.toUpperCase(),
    object.name.toUpperCase(),
    (object.techName ?? '').toUpperCase(),
    (object.uri ?? '').toLowerCase(),
  ].join(' ');
}

/**
 * `objects` appended to `found`, each one `found` does not list yet (the same
 * type and name). A package root that has subpackages answers them in its own
 * `TREE_CONTENT`, and the subpackages type node it lists answers them again
 * (measured on premise, 2026-11-22, BASIS 816): each is listed once. A node
 * SAP could not load is pushed beside it, never through this: two such nodes
 * are two rows, and their rows carry the same words.
 */
function appendUnlisted(
  found: WalkedItem[],
  objects: readonly WalkedItem[],
): void {
  const listed = new Set(found.map(listedKeyOf));
  for (const object of objects) {
    const key = listedKeyOf(object);
    if (listed.has(key)) continue;
    listed.add(key);
    found.push(object);
  }
}

/**
 * The row for a type node SAP could not load: the node's type, the fixed
 * words {@link NOT_LOADED_BY_SAP}, the package; none for a level it loaded.
 */
function notLoadedRow(
  level: NodeLevel,
  type: string,
  packageName: string,
): WalkedItem[] {
  // Each node SAP could not load is its own row: two stay two.
  return (level.notLoaded ?? []).map(
    (): WalkedItem => ({
      name: NOT_LOADED_BY_SAP,
      type,
      packageName,
      notLoaded: true,
    }),
  );
}

function flatten(walk: PackageWalk): WalkedItem[] {
  return [...walk.found, ...walk.subs.flatMap(flatten)];
}

/**
 * Every object in each package of `packageNames`, walked one level at a time
 * (spec §11): per level, (a) the root node structure of every package of the
 * level, read together; (b) every type node those roots list, read together;
 * the next level is the subpackages found — walked only when asked for, and
 * never past `maxDepth`. `read` reads one level's requests together — in one
 * envelope (`batchReader`), or as requests sent alone (`concurrentReader`):
 * no request of a level needs another's answer. Where the destination has
 * no communication batch the handler runs `walkPackage`. The objects carry
 * their node structure's description when descriptions are asked for and
 * `read` answers each request's own (`ownAnswers`); otherwise none, and no
 * description is asked for.
 *
 * One settlement per package asked, in the order asked: its objects — the
 * package's own, then those of each subpackage walked from it, depth first —
 * or its failure: the first refused read of its walk (a level that is not
 * there, `404`, stays empty); a credential failure (a `401` SAP answered
 * included) ends the walk, thrown as it came. `roots`: the first level's root answers, when
 * the caller read them already in a phase of its own.
 */
export async function walkPackages(
  read: LevelReader<NodeRequest, NodeAnswer>,
  packageNames: readonly string[],
  options: WalkOptions = {},
  roots?: readonly PhaseResult<NodeAnswer>[],
): Promise<PhaseResult<WalkedItem[]>[]> {
  // An envelope part's description can be another part's: asked for only
  // where each answer is its request's own.
  const withShortDescriptions =
    options.includeDescriptions === true && read.ownAnswers === true;
  const objectOf = (o: NodeItem, packageName: string) =>
    withShortDescriptions ? { ...o, packageName } : undescribed(o, packageName);
  const limit = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const failures: Map<number, unknown> = new Map<number, unknown>();
  const seen = packageNames.map((name) => new Set([name.toUpperCase()]));
  const walks: PackageWalk[] = packageNames.map((name, root) => ({
    root,
    name: name.toUpperCase(),
    depth: 1,
    found: [],
    subs: [],
  }));

  // The branches the branch rule excluded: a subpackage whose root was refused.
  const excluded = new Set<PackageWalk>();
  /** The level an answer carries, or undefined once its package failed. */
  const settle = (
    walk: PackageWalk,
    result: PhaseResult<NodeAnswer>,
    node?: { id: string; type: string },
  ): NodeLevel | undefined => {
    if (failures.has(walk.root)) return undefined;
    try {
      if (!result.ok) throw result.error;
      const level = levelOf(result.value, options.missingLevel);
      return level;
    } catch (error) {
      const rule = options.branchRule;
      if (rule === undefined) {
        // A credential failure is every root's: it ends the walk as it came.
        if (endsTheCall(error)) throw error;
        failures.set(walk.root, error);
        return undefined;
      }
      // Under the branch rule the caller decides; a return skips what the
      // place names: the node, the subpackage's branch, the asked package.
      const asked = walks[walk.root]?.name ?? walk.name;
      rule.onFailure(
        error,
        node !== undefined
          ? { kind: 'level', package: walk.name, level: { node } }
          : walk.depth > 1
            ? {
                kind: 'level',
                package: asked,
                level: { subpackage: walk.name },
              }
            : { kind: 'package', package: walk.name },
      );
      if (node === undefined) excluded.add(walk);
      return undefined;
    }
  };
  const alive = (walk: PackageWalk) =>
    !failures.has(walk.root) && !excluded.has(walk);

  let level = walks;
  let first = roots;
  while (level.length > 0) {
    const rootAnswers =
      first ??
      (await read(
        level.map((walk) => ({
          parentType: 'DEVC/K',
          parentName: walk.name,
          withShortDescriptions,
        })),
      ));
    first = undefined;
    const typeNodes: Array<{
      walk: PackageWalk;
      nodeId: string;
      type: string;
    }> = [];
    level.forEach((walk, i) => {
      const root = settle(walk, rootAnswers[i]);
      if (root === undefined) return;
      // A package's own level SAP could not load is a row, never an empty
      // package.
      walk.found.push(...notLoadedRow(root, PACKAGE_CODE, walk.name));
      appendUnlisted(
        walk.found,
        nodeItemsOf(root).map((o) => objectOf(o, walk.name)),
      );
      for (const child of childNodesOf(root)) {
        typeNodes.push({ walk, nodeId: child.nodeId, type: child.type });
      }
    });

    if (typeNodes.length > 0) {
      const typeAnswers = await read(
        typeNodes.map(({ walk, nodeId }) => ({
          parentType: 'DEVC/K',
          parentName: walk.name,
          nodeId,
          withShortDescriptions,
        })),
      );
      typeNodes.forEach(({ walk, nodeId, type }, i) => {
        const typed = settle(walk, typeAnswers[i], { id: nodeId, type });
        if (typed === undefined) return;
        walk.found.push(...notLoadedRow(typed, type, walk.name));
        appendUnlisted(
          walk.found,
          nodeItemsOf(typed).map((o) => objectOf(o, walk.name)),
        );
      });
    }

    if (!options.includeSubpackages) break;
    const next: PackageWalk[] = [];
    for (const walk of level) {
      if (!alive(walk) || walk.depth >= limit) continue;
      for (const item of walk.found) {
        // A not-loaded row, or a package SAP listed without a name, is
        // reported, never walked into: no request names it.
        if (
          item.notLoaded === true ||
          item.name === '' ||
          kindOf(item.type) !== 'package'
        ) {
          continue;
        }
        const name = item.name.toUpperCase();
        const own = seen[walk.root];
        if (own.has(name)) continue;
        own.add(name);
        const sub: PackageWalk = {
          root: walk.root,
          name,
          depth: walk.depth + 1,
          found: [],
          subs: [],
        };
        walk.subs.push(sub);
        next.push(sub);
      }
    }
    level = next.filter(alive);
  }

  return walks.map((walk) =>
    failures.has(walk.root)
      ? { ok: false, error: failures.get(walk.root) }
      : { ok: true, value: flatten(walk) },
  );
}

/**
 * Every object in a package, walked one level at a time.
 *
 * One request for the package's root, which lists its object types, then one
 * per type. Subpackages are walked only when asked for, and never past
 * `maxDepth`.
 */
export async function walkPackage(
  utils: NodeStructureSource,
  packageName: string,
  options: WalkOptions = {},
  depth = 1,
  seen: Set<string> = new Set(),
  asked: string = packageName.toUpperCase(),
): Promise<WalkedItem[]> {
  const pkg = packageName.toUpperCase();
  if (seen.has(pkg)) return [];
  seen.add(pkg);

  const withShortDescriptions = options.includeDescriptions === true;
  const root = await underBranchRule(
    options,
    depth > 1
      ? { kind: 'level', package: asked, level: { subpackage: pkg } }
      : { kind: 'package', package: pkg },
    async () =>
      levelOf(
        await utils.fetchNodeStructure('DEVC/K', pkg, {
          withShortDescriptions,
        }),
        options.missingLevel,
      ),
  );
  if (root === undefined) return [];

  // A description only when asked for: SAP sends some without it.
  const owned = (o: WalkedItem): WalkedItem => {
    const { description, ...rest } = o;
    return withShortDescriptions && description !== undefined
      ? { ...rest, description, packageName: pkg }
      : { ...rest, packageName: pkg };
  };
  const found: WalkedItem[] = [];
  // A package's own level SAP could not load is a row, never an empty
  // package.
  found.push(...notLoadedRow(root, PACKAGE_CODE, pkg));
  appendUnlisted(found, nodeItemsOf(root).map(owned));
  for (const child of childNodesOf(root)) {
    const level = await underBranchRule(
      options,
      {
        kind: 'level',
        package: pkg,
        level: { node: { id: child.nodeId, type: child.type } },
      },
      async () =>
        levelOf(
          await utils.fetchNodeStructure('DEVC/K', pkg, {
            nodeId: child.nodeId,
            withShortDescriptions,
          }),
          options.missingLevel,
        ),
    );
    if (level !== undefined) {
      found.push(...notLoadedRow(level, child.type, pkg));
      appendUnlisted(found, nodeItemsOf(level).map(owned));
    }
  }

  if (!options.includeSubpackages) return found;

  const limit = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const out = [...found];
  for (const item of found) {
    // A not-loaded row, or a package SAP listed without a name, is reported,
    // never walked into: no request names it.
    if (
      item.notLoaded === true ||
      item.name === '' ||
      kindOf(item.type) !== 'package'
    ) {
      continue;
    }
    if (depth >= limit) continue;
    appendAll(
      out,
      await walkPackage(utils, item.name, options, depth + 1, seen, asked),
    );
  }
  return out;
}

/**
 * A level of the walk: its answer, or — under the branch rule, when the
 * caller's `onFailure` returns — `undefined`, which skips what `place`
 * names. Without the rule the failure is thrown as it came.
 */
async function underBranchRule<T>(
  options: WalkOptions,
  place: WalkFailurePlace,
  read: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    const rule = options.branchRule;
    if (rule === undefined) throw error;
    rule.onFailure(error, place);
    return undefined;
  }
}

/**
 * One object the walk found, with the package it was found IN. The owner is
 * what lets the list name the right package and the tree nest a
 * subpackage's objects under it rather than under the root.
 */
export type WalkedItem = {
  name: string;
  type: string;
  /** A type node SAP could not load: its row, not an object (`NOT_LOADED_BY_SAP`). */
  notLoaded?: true;
  description?: string | undefined;
  packageName?: string;
  techName?: string | undefined;
  uri?: string | undefined;
};

/**
 * A walked item's identity, for the completeness guard
 * (`src/lib/detail/complete.ts`): its type and name, a nameless one's
 * technical name and URI, and whether SAP could not load it.
 */
export function walkedIdentity(item: {
  type: string;
  name: string;
  techName?: string | undefined;
  uri?: string | undefined;
  notLoaded?: boolean | undefined;
}): string {
  // A named row is its type and name; a nameless one its technical name
  // and URI, the fields that tell it apart.
  const nameless = item.name === '';
  return [
    item.type.toUpperCase(),
    item.name.toUpperCase(),
    nameless ? (item.techName ?? '').toUpperCase() : '',
    nameless ? (item.uri ?? '').toLowerCase() : '',
    item.notLoaded === true ? 'not-loaded' : '',
  ].join('|');
}

/** The step of a failed object metadata read. */
export const METADATA_STEP = 'read object metadata';

/** The `adtcore:type` of a metadata document's root element: what an object SAP listed without a type is. */
export function metadataTypeOf(xml: string): string | undefined {
  let doc: XmlNode | undefined;
  try {
    doc = parseXml(parser, xml);
  } catch {
    return undefined;
  }
  for (const [name, root] of nodeEntries(doc)) {
    if (name.startsWith('?') || typeof root !== 'object') {
      continue;
    }
    const type = nodeChild(root, 'adtcore:type');
    return typeof type === 'string' ? type.trim() || undefined : undefined;
  }
  return undefined;
}

/** The `adtcore:description` of a metadata document's root element. */
export function metadataDescriptionOf(xml: string): string | undefined {
  let doc: XmlNode | undefined;
  try {
    doc = parseXml(parser, xml);
  } catch {
    return undefined;
  }
  for (const [name, root] of nodeEntries(doc)) {
    if (name.startsWith('?') || typeof root !== 'object') {
      continue;
    }
    const description = nodeChild(root, 'adtcore:description');
    return typeof description === 'string'
      ? description.trim() || undefined
      : undefined;
  }
  return undefined;
}

/**
 * The document a metadata reading answered: `AdtReading.raw`, or the
 * document itself where the type's read answers it whole.
 */
function rawOf(value: AdtReading<string> | string): string {
  return typeof value === 'string' ? value : value.raw;
}

/** The descriptions a metadata phase read, and the refusal that ended it. */
export interface MetadataDescriptions {
  /** Each object's description, by `metadataKeyOf`. */
  descriptions: Map<string, string | undefined>;
  /** A metadata read SAP refused with a credential failure, with its step. */
  refused?: IAdtFailure;
}

/**
 * The description of every object of `targets`, read in one ADT batch
 * envelope (`runPhase`): one metadata read per distinct object, the one its
 * type's `Get<Type>` handler sends (`metadataReadOf`), keyed by
 * `metadataKeyOf`. An object of a type with no metadata read, or whose read
 * failed, has no entry. A failure the server's reader answers ends the call,
 * thrown as it came; a read SAP refused with a credential failure is
 * answered as `refused`, the method's error with its step.
 */
export async function metadataDescriptions(
  context: HandlerContext,
  targets: readonly MetadataTarget[],
): Promise<MetadataDescriptions> {
  const reads = new Map<string, MetadataRead>();
  for (const target of targets) {
    const key = metadataKeyOf(target);
    const read = metadataReadOf(target);
    if (key !== undefined && read !== undefined && !reads.has(key)) {
      reads.set(key, read);
    }
  }
  const keyed = [...reads];
  const keys = keyed.map(([key]) => key);
  const descriptions = new Map<string, string | undefined>();
  if (keys.length === 0) return { descriptions };
  const results = await runPhase(context, keyed, ([, read], connection) =>
    atStep(METADATA_STEP, read)(createAdtClient(connection, context.logger)),
  );
  let refused: IAdtFailure | undefined;
  results.forEach((result, i) => {
    if (!result.ok) {
      if (endsTheCall(result.error)) throw result.error;
      return;
    }
    const response = result.value;
    if (response.ok) {
      descriptions.set(
        keys[i],
        metadataDescriptionOf(rawOf(response.getResult().value)),
      );
      return;
    }
    if (
      refused === undefined &&
      isCredentialPayload(failureEntry(response.getError(), METADATA_STEP))
    ) {
      refused = response;
    }
  });
  return refused === undefined ? { descriptions } : { descriptions, refused };
}

/** The flat listing. */
export function assembleList(
  packageName: string,
  objects: WalkedItem[],
): PackageItem[] {
  return objects.map((o) => {
    const kind = kindOf(o.type);
    return {
      name: o.name,
      type: o.type,
      ...(kind ? { kind } : {}),
      ...(o.description ? { description: o.description } : {}),
      packageName: (o.packageName ?? packageName).toUpperCase(),
      isPackage: kind === 'package',
      ...(o.notLoaded === true ? { notLoaded: true as const } : {}),
      ...(o.name === '' && o.techName !== undefined
        ? { techName: o.techName }
        : {}),
      ...(o.name === '' && o.uri !== undefined ? { uri: o.uri } : {}),
    };
  });
}

/** The tree. Same walk, assembled the other way. */
export function assembleTree(
  packageName: string,
  objects: WalkedItem[],
): PackageNode {
  const rootName = packageName.toUpperCase();
  // Each object under the package it was found in. An object with no owner
  // recorded (a caller's own list) goes under the root, as it always did.
  const byOwner = new Map<string, WalkedItem[]>();
  for (const o of objects) {
    const owner = (o.packageName ?? rootName).toUpperCase();
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), o]);
  }
  const seen = new Set<string>([rootName]);
  // The owners whose objects the tree placed: every other owner's objects
  // go under the root, so the tree holds every object walked (plan 9.3).
  const placed = new Set<string>();
  const childrenOf = (owner: string): PackageNode[] => {
    placed.add(owner);
    return (byOwner.get(owner) ?? []).map((o) => nodeOf(o));
  };
  const nodeOf = (o: WalkedItem): PackageNode => {
    const kind = kindOf(o.type);
    const codeFormat = codeFormatOf(o.type);
    return {
      name: o.name,
      type: o.type,
      ...(kind ? { kind } : {}),
      ...(o.description ? { description: o.description } : {}),
      isPackage: kind === 'package',
      ...(o.notLoaded === true ? { notLoaded: true as const } : {}),
      ...(o.name === '' && o.techName !== undefined
        ? { techName: o.techName }
        : {}),
      ...(o.name === '' && o.uri !== undefined ? { uri: o.uri } : {}),
      ...(codeFormat ? { codeFormat } : {}),
      restoreStatus:
        kind && RESTORABLE.has(kind)
          ? ('ok' as const)
          : ('not-implemented' as const),
      // A leaf carries an empty array rather than no field. Present-and-empty
      // and absent are different answers to "what is below this", and a caller
      // that tells them apart by `undefined` is guessing. A subpackage gets
      // what was found in it; `seen` keeps a package that lists itself from
      // recursing.
      children:
        kind === 'package' &&
        o.notLoaded !== true &&
        o.name !== '' &&
        !seen.has(o.name.toUpperCase()) &&
        !placed.has(o.name.toUpperCase())
          ? (seen.add(o.name.toUpperCase()), childrenOf(o.name.toUpperCase()))
          : [],
    };
  };

  const children = childrenOf(rootName);
  // The owners the walk did not reach from the root go under it, each once:
  // first those no other unplaced owner lists as its package (the top of a
  // chain whose parent is missing), so a package listed in such a chain
  // brings its own objects with it, whatever order the walk found them in;
  // then whatever is left (a chain of owners listing each other).
  const listedPackages = new Set(
    [...byOwner]
      .filter(([owner]) => !placed.has(owner))
      .flatMap(([, owned]) =>
        owned
          .filter((o) => kindOf(o.type) === 'package' && o.name !== '')
          .map((o) => o.name.toUpperCase()),
      ),
  );
  const attach = (owner: string, owned: WalkedItem[]) => {
    if (placed.has(owner)) return;
    placed.add(owner);
    children.push(...owned.map((o) => nodeOf(o)));
  };
  for (const [owner, owned] of byOwner) {
    if (!listedPackages.has(owner)) attach(owner, owned);
  }
  for (const [owner, owned] of byOwner) attach(owner, owned);
  return {
    name: rootName,
    type: PACKAGE_CODE,
    kind: 'package',
    isPackage: true,
    codeFormat: 'xml',
    restoreStatus: 'ok',
    children,
  };
}
