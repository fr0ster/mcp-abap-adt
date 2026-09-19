import { XMLParser } from 'fast-xml-parser';

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
    options?: { nodeId?: string; withShortDescriptions?: boolean },
  ): Promise<unknown>;
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
      .filter((o) => o.name),
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

/** `fetchNodeStructure` answers an IAdtResponse; this is the level inside it. */
function levelOf(answer: unknown): NodeLevel {
  const a = answer as {
    ok?: boolean;
    getResult?: () => { value: unknown };
    data?: unknown;
  };
  if (typeof a?.getResult === 'function') {
    if (a.ok === false) return { objects: [], childNodes: [] };
    const value = a.getResult().value;
    // The injected reading may already be ours, or the shipped one over the
    // wire; both are handled rather than assumed.
    if (
      value &&
      typeof value === 'object' &&
      'childNodes' in (value as object)
    ) {
      return value as NodeLevel;
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
): Promise<Array<{ name: string; type: string; description?: string }>> {
  const pkg = packageName.toUpperCase();
  if (seen.has(pkg)) return [];
  seen.add(pkg);

  const withShortDescriptions = options.includeDescriptions !== false;
  const root = levelOf(
    await utils.fetchNodeStructure('DEVC/K', pkg, { withShortDescriptions }),
  );

  const found = [...root.objects];
  for (const child of root.childNodes) {
    const level = levelOf(
      await utils.fetchNodeStructure('DEVC/K', pkg, {
        nodeId: child.nodeId,
        withShortDescriptions,
      }),
    );
    found.push(...level.objects);
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

/** The flat listing. */
export function assembleList(
  packageName: string,
  objects: Array<{ name: string; type: string; description?: string }>,
): PackageItem[] {
  return objects.map((o) => {
    const kind = kindOf(o.type);
    return {
      name: o.name,
      type: o.type,
      ...(kind ? { kind } : {}),
      ...(o.description ? { description: o.description } : {}),
      packageName: packageName.toUpperCase(),
      isPackage: kind === 'package',
    };
  });
}

/** The tree. Same walk, assembled the other way. */
export function assembleTree(
  packageName: string,
  objects: Array<{ name: string; type: string; description?: string }>,
): PackageNode {
  const children: PackageNode[] = objects.map((o) => {
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
      // that tells them apart by `undefined` is guessing.
      children: [],
    };
  });

  return {
    name: packageName.toUpperCase(),
    type: 'DEVC/K',
    kind: 'package',
    isPackage: true,
    codeFormat: 'xml',
    restoreStatus: 'ok',
    children,
  };
}
