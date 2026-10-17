import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../handlers/interfaces';
import { failureOf } from '../auth/failures';
import {
  type PhaseResult,
  runPhase,
  withSequentialFallback,
} from '../batch/phases';
import { carryingFailure } from './step';

/**
 * The one call this walk needs, named structurally.
 *
 * Not `AdtUtils`: the boundary is that adt-clients wraps ADT calls and this
 * repository makes them convenient for a consumer. Depending on one call rather
 * than on the whole utility says which side of that line this file is on, and
 * keeps it testable without a client.
 */
export interface NodeStructureSource {
  fetchNodeStructure(
    parentType: string,
    parentName: string,
    options?: {
      nodeId?: string;
      withShortDescriptions?: boolean;
      analyse?: typeof analyseException;
    },
  ): Promise<unknown>;
}

/**
 * How a walk reads its levels (spec §11): `batched`, every request of a level
 * in one envelope (`runPhase`); `sequential`, one request after another on
 * the call's connection, where the destination has no communication batch.
 */
export type ReadMode = 'batched' | 'sequential';

/** Reads every item of one level; each item's settlement, in item order. */
export type LevelReader<I, R> = (
  items: readonly I[],
) => Promise<PhaseResult<R>[]>;

/**
 * One level's reads in `mode`: `read(item, connection)` for every item, on
 * the phase's batch connection (`batched`) or on the call's connection, one
 * after another (`sequential`). A failure is its item's; a credential refusal
 * (any failure the server's reader answers) ends the walk as it came, in both
 * modes.
 */
export function levelReader<I, R>(
  context: HandlerContext,
  mode: ReadMode,
  read: (item: I, connection: IAbapConnection) => Promise<R>,
): LevelReader<I, R> {
  if (mode === 'batched') {
    return (items) => runPhase(context, items, read);
  }
  return sequentialReads((item) => read(item, context.connection));
}

/**
 * A level read one request after another: each item's settlement, in item
 * order; a credential refusal (any failure the server's reader answers)
 * thrown as it came.
 */
function sequentialReads<I, R>(
  read: (item: I) => Promise<R>,
): LevelReader<I, R> {
  return async (items) => {
    const out: PhaseResult<R>[] = [];
    for (const item of items) {
      try {
        out.push({ ok: true, value: await read(item) });
      } catch (error) {
        if (failureOf(error) !== undefined) throw error;
        out.push({ ok: false, error });
      }
    }
    return out;
  };
}

/**
 * A walk by levels: `walk('batched')`, or `walk('sequential')` where the
 * destination has no communication batch (`withSequentialFallback`).
 */
export function byLevels<T>(
  context: HandlerContext,
  walk: (mode: ReadMode) => Promise<T>,
): Promise<T> {
  return withSequentialFallback(
    context,
    () => walk('batched'),
    () => walk('sequential'),
  );
}

/** One node structure request of a walk. */
export interface NodeRequest {
  parentType: string;
  parentName: string;
  nodeId?: string;
  withShortDescriptions: boolean;
  /** Read with `analyseException`: a refusal answered as `ok: false`. */
  analysed?: boolean;
}

/** `request` read on `utils`: one `fetchNodeStructure`. */
export function readNode(
  utils: NodeStructureSource,
  request: NodeRequest,
): Promise<unknown> {
  return utils.fetchNodeStructure(request.parentType, request.parentName, {
    ...(request.analysed ? { analyse: analyseException } : {}),
    ...(request.nodeId !== undefined ? { nodeId: request.nodeId } : {}),
    withShortDescriptions: request.withShortDescriptions,
  });
}

/**
 * One level of the tree, as our `node` result strategy reads it.
 *
 * The shipped `nodeContents` answers `objectType`, `objectName`, `techName` and
 * `objectUri` — and no description. A package listing shows descriptions, so
 * this repository supplies its own reading of the same one answer. That is the
 * injection point working as intended: one request, one reading, ours — but
 * the trade was ADDING the description, never dropping `techName`/`objectUri`
 * (a mistake this file shipped with and task 12 then perpetuated in two
 * handlers before it was caught in review; see the task's own report). Every
 * `SEU_ADT_REPOSITORY_OBJ_NODE` in all seven captured `read-object-tree-
 * structure` fixtures under `tests/fixtures/adt/` carries both `TECH_NAME`
 * and `OBJECT_URI` — fixture 05's function group is the one that actually
 * exercises the distinction (`OBJECT_NAME: ZMCP_SHR_FGRP`,
 * `TECH_NAME: SAPLZMCP_SHR_FGRP`) — so both are read here, from the same
 * element `name`/`type`/`description` already come from.
 */
export interface NodeLevel {
  objects: Array<{
    name: string;
    type: string;
    description?: string;
    techName?: string;
    uri?: string;
  }>;
  childNodes: Array<{ type: string; nodeId: string }>;
}

/** Our `node` strategy: one answer in, one level out, descriptions kept. */
export function nodeLevel(answer: unknown): NodeLevel {
  const xml = String((answer as { data?: unknown })?.data ?? '');
  const data = (parser.parse(xml) as any)?.['asx:abap']?.['asx:values']?.DATA;
  return {
    objects: asArray(data?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE)
      .map((n: any) => ({
        name: textOf(n?.OBJECT_NAME),
        type: textOf(n?.OBJECT_TYPE),
        description: textOf(n?.DESCRIPTION) || undefined,
        techName: textOf(n?.TECH_NAME) || undefined,
        uri: textOf(n?.OBJECT_URI) || undefined,
      }))
      // Every object has a type. An entry without one is SAP's message for
      // a node it could not load ("Error loading node:", on premise 2026-09-25),
      // not an object.
      .filter((o) => o.name && o.type),
    childNodes: asArray(data?.OBJECT_TYPES?.SEU_ADT_OBJECT_TYPE_INFO)
      .map((t: any) => ({
        type: textOf(t?.OBJECT_TYPE),
        // The document writes the id padded — `000031` — and the request the
        // corpus recorded sends `31`. The system accepts both, verified
        // live, but sending what ADT itself sends keeps the wire comparable
        // with the fixtures and with a trace.
        nodeId: String(Number(textOf(t?.NODE_ID))),
      }))
      .filter((c) => c.nodeId && c.nodeId !== 'NaN'),
  };
}

/** Ours: objects carry `name`, child nodes carry `type`. */
function isOurLevel(value: object): value is NodeLevel {
  const v = value as { objects?: unknown[]; childNodes?: unknown[] };
  const first = (v.objects ?? [])[0] ?? (v.childNodes ?? [])[0];
  return (
    first === undefined ||
    (typeof first === 'object' &&
      first !== null &&
      ('name' in first || 'type' in first))
  );
}

/**
 * The library's own `nodeContents` reading, in our shape. It carries no
 * description — a caller wanting one passes `ourUtils` — but names, types,
 * tech names and URIs are all there.
 */
function fromLibraryLevel(value: object): NodeLevel {
  const v = value as {
    objects?: Array<Record<string, unknown>>;
    childNodes?: Array<Record<string, unknown>>;
  };
  return {
    objects: (v.objects ?? [])
      .map((o) => ({
        name: String(o.objectName ?? ''),
        type: String(o.objectType ?? ''),
        techName: o.techName ? String(o.techName) : undefined,
        uri: o.objectUri ? String(o.objectUri) : undefined,
      }))
      .filter((o) => o.name && o.type),
    childNodes: (v.childNodes ?? [])
      .map((c) => ({
        type: String(c.objectType ?? ''),
        nodeId: String(Number(c.nodeId)),
      }))
      .filter((c) => c.nodeId && c.nodeId !== 'NaN'),
  };
}

/** `fetchNodeStructure` answers an IAdtResponse; this is the level inside it. */
function levelOf(answer: unknown): NodeLevel {
  const a = answer as {
    ok?: boolean;
    getResult?: () => { value: unknown };
    data?: unknown;
  };
  if (a?.ok === false) {
    const error = (answer as { getError: () => IAdtError }).getError();
    // A level that is not there stays what it was: empty. Any other refusal
    // is the method's error as it is, with the step — not an empty level that
    // reads as "nothing here".
    if (error?.response?.status === 404) return { objects: [], childNodes: [] };
    throw carryingFailure(
      new Error(error.message),
      error,
      'read package node structure',
    );
  }
  if (typeof a?.getResult === 'function') {
    const value = a.getResult().value;
    // The injected reading may be ours, the library's own, or the raw wire;
    // each is recognised by what it carries, never assumed. Having
    // `childNodes` is NOT enough to be ours: the library's reading has them
    // too, keyed `objectType`/`objectName`, and passing it through as ours
    // answered nameless, typeless rows (on premise, 2026-09-25).
    if (value && typeof value === 'object' && 'childNodes' in value) {
      return isOurLevel(value) ? value : fromLibraryLevel(value);
    }
    return nodeLevel({ data: value });
  }
  return nodeLevel(answer);
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
  description?: string;
  packageName: string;
  isPackage: boolean;
}

/** One node of a tree. */
export interface PackageNode {
  name: string;
  type: string;
  kind?: PackageItemKind;
  description?: string;
  isPackage: boolean;
  codeFormat?: CodeFormat;
  restoreStatus?: 'ok' | 'not-implemented';
  children?: PackageNode[];
}

const KIND_BY_TYPE: Record<string, PackageItemKind> = {
  'DEVC/K': 'package',
  'DOMA/DD': 'domain',
  'DTEL/DE': 'dataElement',
  'TABL/DS': 'structure',
  'STRU/DT': 'structure',
  'TABL/DT': 'table',
  'TTYP/DF': 'tableType',
  'TTYP/TT': 'tableType',
  'DDLS/DF': 'view',
  'DDLX/EX': 'metadataExtension',
  'CLAS/OC': 'class',
  'INTF/IF': 'interface',
  'INTF/OI': 'interface',
  'PROG/P': 'program',
  'FUGR/FF': 'functionModule',
  'FUGR/F': 'functionGroup',
  FUGR: 'functionGroup',
  'SRVD/SRV': 'serviceDefinition',
  'BDEF/BDO': 'behaviorDefinition',
  'BIMP/BIM': 'behaviorImplementation',
};

/** The coarse classification, from the ADT type code. */
export function kindOf(
  adtType: string | undefined,
): PackageItemKind | undefined {
  if (!adtType) return undefined;
  const type = adtType.toUpperCase();
  if (KIND_BY_TYPE[type]) return KIND_BY_TYPE[type];
  if (type.startsWith('CLAS/')) return 'class';
  if (type.startsWith('INTF/')) return 'interface';
  if (type.startsWith('PROG/')) return 'program';
  if (type.startsWith('DEVC')) return 'package';
  return undefined;
}

/** Whether the object's editor content is XML or source. Tree only. */
export function codeFormatOf(
  adtType: string | undefined,
): CodeFormat | undefined {
  const type = (adtType ?? '').toUpperCase();
  if (!type) return undefined;
  if (type === 'DEVC' || type.startsWith('DEVC/')) return 'xml';
  if (type.startsWith('DOMA/')) return 'xml';
  if (type.startsWith('DTEL/')) return 'xml';
  if (type === 'FUGR' || type === 'FUGR/F') return 'xml';
  for (const prefix of [
    'CLAS/',
    'INTF/',
    'PROG/',
    'DDLS/',
    'DDLX/',
    'SRVD/',
    'TABL/DT',
    'TABL/DS',
    'STRU/',
    'TTYP/',
    'FUGR/FF',
    'BDEF/',
    'BIMP/',
    'BIMPL/',
  ]) {
    if (type.startsWith(prefix)) return 'source';
  }
  return undefined;
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

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const t = (value as Record<string, unknown>)['#text'];
    if (typeof t === 'string' || typeof t === 'number') return String(t).trim();
  }
  return '';
}

export interface WalkOptions {
  includeSubpackages?: boolean;
  maxDepth?: number;
  includeDescriptions?: boolean;
}

/** A package of a walk: what was found in it, and the subpackages walked from it. */
interface PackageWalk {
  root: number;
  name: string;
  depth: number;
  found: WalkedItem[];
  subs: PackageWalk[];
}

function flatten(walk: PackageWalk): WalkedItem[] {
  return [...walk.found, ...walk.subs.flatMap(flatten)];
}

/**
 * Every object in each package of `packageNames`, walked one level at a time
 * (spec §11): per level, (a) the root node structure of every package of the
 * level, read together; (b) every type node those roots list, read together;
 * the next level is the subpackages found — walked only when asked for, and
 * never past `maxDepth`. `read` reads one level's requests (`levelReader`):
 * no request of a level needs another's answer.
 *
 * One settlement per package asked, in the order asked: its objects — the
 * package's own, then those of each subpackage walked from it, depth first —
 * or its failure: the first refused read of its walk (a level that is not
 * there, `404`, stays empty). `roots`: the first level's root answers, when
 * the caller read them already in a phase of its own.
 */
export async function walkPackages(
  read: LevelReader<NodeRequest, unknown>,
  packageNames: readonly string[],
  options: WalkOptions = {},
  roots?: readonly PhaseResult<unknown>[],
): Promise<PhaseResult<WalkedItem[]>[]> {
  const withShortDescriptions = options.includeDescriptions !== false;
  const limit = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const failures = new Map<number, unknown>();
  const seen = packageNames.map((name) => new Set([name.toUpperCase()]));
  const walks: PackageWalk[] = packageNames.map((name, root) => ({
    root,
    name: name.toUpperCase(),
    depth: 1,
    found: [],
    subs: [],
  }));

  /** The level an answer carries, or undefined once its package failed. */
  const settle = (
    walk: PackageWalk,
    result: PhaseResult<unknown> | undefined,
  ): NodeLevel | undefined => {
    if (failures.has(walk.root) || result === undefined) return undefined;
    if (!result.ok) {
      failures.set(walk.root, result.error);
      return undefined;
    }
    try {
      return levelOf(result.value);
    } catch (error) {
      failures.set(walk.root, error);
      return undefined;
    }
  };
  const alive = (walk: PackageWalk) => !failures.has(walk.root);

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
    const typeNodes: Array<{ walk: PackageWalk; nodeId: string }> = [];
    level.forEach((walk, i) => {
      const root = settle(walk, rootAnswers[i]);
      if (root === undefined) return;
      walk.found.push(
        ...root.objects.map((o) => ({ ...o, packageName: walk.name })),
      );
      for (const child of root.childNodes) {
        typeNodes.push({ walk, nodeId: child.nodeId });
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
      typeNodes.forEach(({ walk }, i) => {
        const typed = settle(walk, typeAnswers[i]);
        if (typed === undefined) return;
        walk.found.push(
          ...typed.objects.map((o) => ({ ...o, packageName: walk.name })),
        );
      });
    }

    if (!options.includeSubpackages) break;
    const next: PackageWalk[] = [];
    for (const walk of level) {
      if (!alive(walk) || walk.depth >= limit) continue;
      for (const item of walk.found) {
        if (kindOf(item.type) !== 'package') continue;
        const name = item.name.toUpperCase();
        const own = seen[walk.root];
        if (own === undefined || own.has(name)) continue;
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
 * Every object in one package, walked one level at a time on `utils`, one
 * request after another (`walkPackages`); its failure thrown.
 */
export async function walkPackage(
  utils: NodeStructureSource,
  packageName: string,
  options: WalkOptions = {},
): Promise<WalkedItem[]> {
  const [walked] = await walkPackages(
    sequentialReads((request: NodeRequest) => readNode(utils, request)),
    [packageName],
    options,
  );
  if (walked === undefined || !walked.ok) throw walked?.error;
  return walked.value;
}

/**
 * One object the walk found, with the package it was found IN. The owner is
 * what lets the list name the right package and the tree nest a
 * subpackage's objects under it rather than under the root.
 */
export type WalkedItem = {
  name: string;
  type: string;
  description?: string;
  packageName?: string;
};

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
  const childrenOf = (owner: string): PackageNode[] =>
    (byOwner.get(owner) ?? []).map((o) => nodeOf(o));
  const nodeOf = (o: WalkedItem): PackageNode => {
    const kind = kindOf(o.type);
    const codeFormat = codeFormatOf(o.type);
    return {
      name: o.name,
      type: o.type,
      ...(kind ? { kind } : {}),
      ...(o.description ? { description: o.description } : {}),
      isPackage: kind === 'package',
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
        kind === 'package' && !seen.has(o.name.toUpperCase())
          ? (seen.add(o.name.toUpperCase()), childrenOf(o.name.toUpperCase()))
          : [],
    };
  };

  return {
    name: rootName,
    type: 'DEVC/K',
    kind: 'package',
    isPackage: true,
    codeFormat: 'xml',
    restoreStatus: 'ok',
    children: childrenOf(rootName),
  };
}
