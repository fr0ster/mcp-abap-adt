import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtFailure } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../handlers/interfaces';
import {
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
} from '../answer';
import { failureOf } from '../auth/failures';
import { type PhaseResult, runPhase } from '../batch/phases';
import { createAdtClient } from '../clients';
import {
  type MetadataRead,
  type MetadataTarget,
  metadataKeyOf,
  metadataReadOf,
} from './metadataReads';
import { atStep, carryingFailure } from './step';

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

/** Reads every item of one level; each item's settlement, in item order. */
export type LevelReader<I, R> = (
  items: readonly I[],
) => Promise<PhaseResult<R>[]>;

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

/**
 * An object of a batched level, found in `packageName`, without the
 * description its part carried: a node structure part after the first of an
 * envelope can carry another part's `DESCRIPTION` (measured, 2026-10-18), so
 * a batched walk takes the description from the object's metadata
 * (`describeFromMetadata`).
 */
function undescribed(
  object: NodeLevel['objects'][number],
  packageName: string,
): WalkedItem {
  const { description: _part, ...rest } = object;
  return { ...rest, packageName };
}

function flatten(walk: PackageWalk): WalkedItem[] {
  return [...walk.found, ...walk.subs.flatMap(flatten)];
}

/**
 * Every object in each package of `packageNames`, walked one level at a time
 * (spec §11): per level, (a) the root node structure of every package of the
 * level, read together; (b) every type node those roots list, read together;
 * the next level is the subpackages found — walked only when asked for, and
 * never past `maxDepth`. `read` reads one level's requests in one envelope
 * (`batchReader`): no request of a level needs another's answer. Where the
 * destination has no communication batch the handler runs `walkPackage`.
 * The objects carry no description: a caller that answers descriptions
 * reads them with `describeFromMetadata`.
 *
 * One settlement per package asked, in the order asked: its objects — the
 * package's own, then those of each subpackage walked from it, depth first —
 * or its failure: the first refused read of its walk (a level that is not
 * there, `404`, stays empty); a credential failure (a `401` SAP answered
 * included) ends the walk, thrown as it came. `roots`: the first level's root answers, when
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
    result: PhaseResult<unknown>,
  ): NodeLevel | undefined => {
    if (failures.has(walk.root)) return undefined;
    try {
      if (!result.ok) throw result.error;
      return levelOf(result.value);
    } catch (error) {
      // A credential failure is every root's: it ends the walk as it came.
      if (endsTheCall(error)) throw error;
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
      walk.found.push(...root.objects.map((o) => undescribed(o, walk.name)));
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
        walk.found.push(...typed.objects.map((o) => undescribed(o, walk.name)));
      });
    }

    if (!options.includeSubpackages) break;
    const next: PackageWalk[] = [];
    for (const walk of level) {
      if (!alive(walk) || walk.depth >= limit) continue;
      for (const item of walk.found) {
        if (kindOf(item.type) !== 'package') continue;
        const name = item.name.toUpperCase();
        const own = seen[walk.root] as Set<string>;
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
): Promise<WalkedItem[]> {
  const pkg = packageName.toUpperCase();
  if (seen.has(pkg)) return [];
  seen.add(pkg);

  const withShortDescriptions = options.includeDescriptions !== false;
  const root = levelOf(
    await utils.fetchNodeStructure('DEVC/K', pkg, { withShortDescriptions }),
  );

  const found: WalkedItem[] = root.objects.map((o) => ({
    ...o,
    packageName: pkg,
  }));
  for (const child of root.childNodes) {
    const level = levelOf(
      await utils.fetchNodeStructure('DEVC/K', pkg, {
        nodeId: child.nodeId,
        withShortDescriptions,
      }),
    );
    found.push(...level.objects.map((o) => ({ ...o, packageName: pkg })));
  }

  if (!options.includeSubpackages) return found;

  const limit = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const out = [...found];
  for (const item of found) {
    if (kindOf(item.type) !== 'package') continue;
    if (depth >= limit) continue;
    out.push(
      ...(await walkPackage(utils, item.name, options, depth + 1, seen)),
    );
  }
  return out;
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
  techName?: string;
  uri?: string;
};

/** The step of a failed object metadata read. */
export const METADATA_STEP = 'read object metadata';

/** The `adtcore:description` of a metadata document's root element. */
export function metadataDescriptionOf(xml: string): string | undefined {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return undefined;
  }
  if (doc === null || typeof doc !== 'object') return undefined;
  for (const [name, root] of Object.entries(doc as Record<string, unknown>)) {
    if (name.startsWith('?') || root === null || typeof root !== 'object') {
      continue;
    }
    const description = (root as Record<string, unknown>)[
      'adtcore:description'
    ];
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
function rawOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const raw = (value as { raw?: unknown } | undefined)?.raw;
  return typeof raw === 'string' ? raw : '';
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
  const keys = [...reads.keys()];
  const descriptions = new Map<string, string | undefined>();
  if (keys.length === 0) return { descriptions };
  const results = await runPhase(context, keys, (key, connection) =>
    atStep(
      METADATA_STEP,
      reads.get(key) as MetadataRead,
    )(createAdtClient(connection, context.logger)),
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
        keys[i] as string,
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

/**
 * Every walked object's description from its metadata (spec §11, the batched
 * walks): one phase over the objects of every walk that answered, each
 * object's description its metadata's `adtcore:description`. An object of a
 * type with no metadata read (`metadataKeyOf`), or whose read failed, has no
 * description. A metadata read SAP refused with a credential failure ends
 * the call: thrown, carrying the method's error with its step.
 */
export async function describeFromMetadata(
  context: HandlerContext,
  walked: readonly PhaseResult<WalkedItem[]>[],
): Promise<PhaseResult<WalkedItem[]>[]> {
  const { descriptions, refused } = await metadataDescriptions(
    context,
    walked.flatMap((result) => (result.ok ? result.value : [])),
  );
  if (refused !== undefined) {
    const error = refused.getError();
    throw carryingFailure(new Error(error.message), error, METADATA_STEP);
  }
  return walked.map((result) =>
    result.ok
      ? {
          ok: true,
          value: result.value.map((item) => {
            const key = metadataKeyOf(item);
            const description =
              key === undefined ? undefined : descriptions.get(key);
            return description === undefined ? item : { ...item, description };
          }),
        }
      : result,
  );
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
