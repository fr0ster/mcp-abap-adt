import {
  type IWhereUsedReference,
  rawOf,
  utilWhereUsedReferences,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtHeaders,
  IAdtResponse,
  IAdtWhereUsedParamsOf,
  IAdtWhereUsedScopeParamsOf,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import type { XmlRead } from '../xml/tree';
import type { AdtReading } from './reading';
import { atStep } from './step';
import { succeeded } from './stepResponse';
import {
  snippetElement,
  type UsageSnippetsSource,
  type WhereUsedSnippet,
} from './usageSnippets';

/**
 * `getWhereUsedList`'s replacement, composed — the guide's "Sequences are
 * yours" table entry: `getWhereUsedScope`, `modifyWhereUsedScope` (no
 * request, a local string edit), `getWhereUsed`.
 *
 * Depending on the three members structurally, not on `AdtUtils` itself —
 * the same boundary `packageWalk.ts`'s `NodeStructureSource` draws — keeps
 * this testable without a client and honest about what it actually calls.
 * Both members take `options.analyse` since adt-clients 23; this interface
 * names only what the where-used flow passes, and no strategy is part of it.
 */
export interface WhereUsedSource {
  getWhereUsedScope(
    params: IAdtWhereUsedScopeParamsOf,
  ): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>>;
  /** Local — issues no request. */
  modifyWhereUsedScope(
    scopeXml: string,
    options: {
      enableAll?: boolean | undefined;
      enableOnly?: string[] | undefined;
      enable?: string[] | undefined;
      disable?: string[] | undefined;
    },
  ): string;
  getWhereUsed(
    params: IAdtWhereUsedParamsOf,
  ): Promise<IAdtResponse<WhereUsedListRead, IAdtError>>;
}

/** What `modifyWhereUsedScope` takes: each option may be absent. */
export type WhereUsedScopeOptions = Parameters<
  WhereUsedSource['modifyWhereUsedScope']
>[1];

/**
 * The scope options with only the ones that have a value, for a client whose
 * options are declared without `| undefined`.
 */
export function presentScopeOptions(options: WhereUsedScopeOptions): {
  enableAll?: boolean;
  enableOnly?: string[];
  enable?: string[];
  disable?: string[];
} {
  return {
    ...(options.enableAll !== undefined && { enableAll: options.enableAll }),
    ...(options.enableOnly !== undefined && {
      enableOnly: options.enableOnly,
    }),
    ...(options.enable !== undefined && { enable: options.enable }),
    ...(options.disable !== undefined && { disable: options.disable }),
  };
}

/**
 * The utilities' three where-used members as adt-clients declares them: the
 * two requests take their header pair (`options.headers`).
 */
export interface WhereUsedMembers {
  getWhereUsedScope(
    params: IAdtWhereUsedScopeParamsOf,
    options: { headers: IAdtHeaders },
  ): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>>;
  modifyWhereUsedScope: WhereUsedSource['modifyWhereUsedScope'];
  getWhereUsed(
    params: IAdtWhereUsedParamsOf,
    options: { headers: IAdtHeaders },
  ): Promise<IAdtResponse<WhereUsedListRead, IAdtError>>;
}

/**
 * `utils` as a `WhereUsedSource`: each request with the header pair of its
 * member for the call's system (`withAdtHeaders`).
 */
export function whereUsedOn(
  context: AdtHeadersContext,
  utils: WhereUsedMembers,
): WhereUsedSource {
  return {
    getWhereUsedScope: (params) =>
      withAdtHeaders(context, 'utils.getWhereUsedScope', (headers) =>
        utils.getWhereUsedScope(params, { headers }),
      ),
    modifyWhereUsedScope: (scopeXml, options) =>
      utils.modifyWhereUsedScope(scopeXml, options),
    getWhereUsed: (params) =>
      withAdtHeaders(context, 'utils.getWhereUsed', (headers) =>
        utils.getWhereUsed(params, { headers }),
      ),
  };
}

/** One reference of a where-used list: a JSON object, as the tool answers it. */
export type WhereUsedReference = {
  /** `adtcore:name` as SAP sent it — an element's name for an element usage. */
  name: string;
  /** `adtcore:type` as SAP sent it; `''` when the row carries none. */
  type: string;
  uri?: string | undefined;
  /** `parentUri` as SAP sent it: the node the row hangs under. */
  parent_uri?: string | undefined;
  package_name?: string | undefined;
  responsible?: string | undefined;
  usage_information?: string | undefined;
  /**
   * A usage inside an element of another object (a method, a section of a
   * class): SAP lists it with no `adtcore:type`, its `adtcore:name` the
   * element, and the object it belongs to only as `parentUri`. The object is
   * the list's own node at that URI: its type, name and package here, the
   * element beside them. Absent on any other row, and on a row whose
   * `parentUri` names no node of the list.
   */
  parent_type?: string | undefined;
  parent_name?: string | undefined;
  parent_package?: string | undefined;
  element?: string | undefined;
  /** `objectIdentifier` as SAP sent it: what the code lines are asked by. */
  object_identifier?: string | undefined;
  /**
   * The source lines holding the usage (`usageSnippets`), as SAP sent them,
   * each with its position; absent for a reference not asked for (no
   * identifier, no usage) and for one SAP gave none (a usage not in code).
   */
  snippets?: WhereUsedSnippet[] | undefined;
  /** A row's code line: one snippet's content, trimmed (terse and medium only). */
  code?: string | undefined;
};

/**
 * The object a reference names, as terse and medium answer it: an element
 * usage ({@link WhereUsedReference.element}) as the object it belongs to —
 * its type, name and package — with the element beside them; any other
 * reference as SAP sent it.
 */
export function usingObject(reference: WhereUsedReference): WhereUsedReference {
  const {
    parent_type: type,
    parent_name: name,
    parent_package: parentPackage,
    element,
    ...fields
  } = reference;
  if (type === undefined || name === undefined || element === undefined) {
    return fields;
  }
  return {
    ...fields,
    type,
    name,
    package_name: fields.package_name ?? parentPackage,
    element,
  };
}

export interface WhereUsedListResult {
  totalReferences: number;
  resultDescription?: string | undefined;
  references: WhereUsedReference[];
}

/** A where-used list as read, with the document SAP answered (`detail: 'raw'`). */
export interface WhereUsedListRead extends WhereUsedListResult {
  document: string;
}

export interface WhereUsedFilter {
  enableAllTypes?: boolean | undefined;
  enableOnlyTypes?: string[] | undefined;
  disableTypes?: string[] | undefined;
}

/**
 * The where-used slot's reading (`ourUtils.whereUsed`): the references as
 * adt-strategies reads `/usageReferences` (`utilWhereUsedReferences`, 0.28.0),
 * each in the fields this tool has always answered (`name`, `type`, `uri`,
 * `package_name`, `responsible`, `usage_information`) — package nodes kept,
 * as before, their `kind` the reading's — with the document SAP answered
 * (`detail: 'raw'`). A code adt-strategies does not know is answered as SAP
 * sent it.
 */
export const whereUsedListReading = (
  answer: IAdtWireResponse,
): WhereUsedListRead => {
  const read = utilWhereUsedReferences(answer);
  // A reference SAP lists without a name is kept when it carries an address
  // and a usage attribute — an object that uses the one asked, its URI what
  // tells it apart (Codex round 7). The attribute's presence decides, never
  // its value: `usageInformation=""` is a usage too (Codex round 8).
  const listed = read.references.filter(
    (reference) =>
      reference.name !== '' ||
      (reference.uri !== '' && reference.usageInformation !== undefined),
  );
  // The nodes by their URI: an element usage's object is the node at its
  // `parentUri`, read off the list itself (the first one listed there).
  const nodes = new Map<string, IWhereUsedReference>();
  for (const reference of read.references) {
    if (reference.uri !== '' && !nodes.has(reference.uri)) {
      nodes.set(reference.uri, reference);
    }
  }
  const references: WhereUsedReference[] = listed.map((reference) => {
    const type = reference.type ?? reference.unknownType;
    const fields: WhereUsedReference = {
      name: reference.name,
      type,
      uri: reference.uri || undefined,
      parent_uri: reference.parentUri || undefined,
      package_name: reference.packageName || undefined,
      responsible: reference.responsible || undefined,
      // As SAP sent it: an empty attribute stays a usage, `''`.
      usage_information: reference.usageInformation,
      object_identifier: reference.objectIdentifier || undefined,
    };
    const parent = elementParent(
      type,
      reference.name,
      reference.parentUri,
      nodes,
    );
    return parent === undefined
      ? fields
      : {
          ...fields,
          parent_type: parent.type,
          parent_name: parent.name,
          parent_package: parent.packageName || undefined,
          element: reference.name,
        };
  });
  return {
    totalReferences: read.totalReferences,
    resultDescription: read.resultDescription || undefined,
    references,
    document: rawOf(answer),
  };
};

/**
 * The object an element usage belongs to: for a row SAP sent with no type
 * but a name and a `parentUri`, the list's node at that URI, when it has a
 * type and a name of its own; `undefined` for any other row. The node's type
 * is taken as SAP listed it, never assumed.
 */
function elementParent(
  type: string,
  name: string,
  parentUri: string | undefined,
  nodes: ReadonlyMap<string, IWhereUsedReference>,
):
  | { type: string; name: string; packageName?: string | undefined }
  | undefined {
  if (type !== '' || name === '' || parentUri === undefined) return undefined;
  const node = nodes.get(parentUri);
  if (node === undefined) return undefined;
  const nodeType = node.type ?? node.unknownType;
  if (nodeType === '' || node.name === '') return undefined;
  return { type: nodeType, name: node.name, packageName: node.packageName };
}

/** A row terse and medium answer: a reference as {@link usageRows} shows it. */
export type WhereUsedRow = Omit<
  WhereUsedReference,
  'snippets' | 'object_identifier'
>;

/** What terse and medium list: the count SAP gave, and every row. */
export interface WhereUsedRows {
  totalReferences: number;
  references: WhereUsedRow[];
}

/** The rows of `result`, in its order: {@link usageRows} of each reference. */
export function whereUsedRows(result: WhereUsedListResult): WhereUsedRows {
  return {
    totalReferences: result.totalReferences,
    references: result.references.flatMap(usageRows),
  };
}

/**
 * The rows terse and medium answer for `reference`, each naming the object
 * it is in ({@link usingObject}): one per code line SAP gave for it, with
 * the line (`code`, trimmed) and, where the reference names no element,
 * the element its position names (`name=`); one row with no code line for
 * a reference SAP gave none.
 */
export function usageRows(reference: WhereUsedReference): WhereUsedRow[] {
  const { snippets, object_identifier, ...fields } = reference;
  const shown = usingObject(fields);
  if (snippets === undefined || snippets.length === 0) return [shown];
  return snippets.map((snippet) => {
    const element = shown.element ?? snippetElement(snippet.uri);
    return {
      ...shown,
      ...(element === undefined ? {} : { element }),
      code: snippet.content.trim(),
    };
  });
}

/** One object that uses the one asked for, named by its type and name. */
export interface InObject {
  object_type: string;
  object_name: string;
}

/** `value` as compared: trimmed, upper case. */
function comparable(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Whether `reference` is a usage inside `inObject`: a usage (it carries
 * `usage_information`) whose object — the one it is in where the list
 * resolves it (`parent_type`, `parent_name`), else its own — has that type
 * and name.
 */
export function usageIn(
  reference: WhereUsedReference,
  inObject: InObject,
): boolean {
  if (reference.usage_information === undefined) return false;
  const type = reference.parent_type ?? reference.type;
  const name = reference.parent_name ?? reference.name;
  return (
    comparable(type) === comparable(inObject.object_type) &&
    comparable(name) === comparable(inObject.object_name)
  );
}

/**
 * The usages of a where-used list inside one using object, with their code
 * lines: the list kept to the usages {@link usageIn} `inObject`, then ONE
 * `usageSnippets` read over exactly their identifiers, each answer joined
 * to its usage by its identifier. An object with no usage in the list
 * answers none, with no request. A refused or unreadable read is the
 * answer, with its step — never the usages without their lines.
 */
export async function withUsageSnippets(
  listed: IAdtResponse<WhereUsedListRead, IAdtError>,
  source: UsageSnippetsSource,
  inObject: InObject,
): Promise<IAdtResponse<WhereUsedListRead, IAdtError>> {
  if (!listed.ok) return listed;
  const read = listed.getResult().value;
  const inside = read.references.filter((reference) =>
    usageIn(reference, inObject),
  );
  const identifiers = [
    ...new Set(
      inside.flatMap((reference) =>
        reference.object_identifier === undefined
          ? []
          : [reference.object_identifier],
      ),
    ),
  ];
  if (identifiers.length === 0) {
    return succeeded({ ...read, references: inside });
  }
  const answered = await atStep('read where-used code lines', () =>
    source.read(identifiers),
  )();
  if (!answered.ok) return answered;
  const snippets = answered.getResult().value;
  return succeeded({
    ...read,
    references: inside.map((reference) => {
      const lines =
        reference.object_identifier === undefined
          ? undefined
          : snippets.get(reference.object_identifier);
      return lines === undefined || lines.length === 0
        ? reference
        : { ...reference, snippets: [...lines] };
    }),
  });
}

function needsScope(filter: WhereUsedFilter): boolean {
  return Boolean(
    filter.enableAllTypes ||
      (filter.enableOnlyTypes && filter.enableOnlyTypes.length > 0) ||
      (filter.disableTypes && filter.disableTypes.length > 0),
  );
}

/**
 * Fetch where-used references, scoped only when a filter asks for it.
 *
 * `getWhereUsed` on its own already runs unscoped against "SAP's default
 * scope" (its own doc comment), which is the same shortcut the removed
 * `getWhereUsedList` took when there was nothing to modify — so the scope
 * round trip is skipped unless `enableAllTypes`/`enableOnlyTypes`/
 * `disableTypes` is set.
 *
 * **A refused scope fetch is surfaced, not swallowed.** The guide notes the
 * removed composite "fell back silently" to an unscoped, client-filtered
 * search when `/usageReferences/scope` answered 404 on some S/4 releases,
 * and hands that decision to the caller ("Your system, your decision"). No
 * fixture in this repository's corpus captures that 404 or what a correct
 * client-side filter over the unfiltered result should look like, so
 * reproducing the fallback here would be exactly the invented-shape guess
 * this migration exists to remove. A refused scope fetch is returned as the
 * refusal it is.
 */
/**
 * The object a where-used request names, as `params` names it: its name and
 * code, and with `PROG/PX` its container (interfaces-adt 30: required with
 * `PROG/PX`, refused with every other code).
 */
export function whereUsedTarget(
  params: IAdtWhereUsedScopeParamsOf,
): IAdtWhereUsedScopeParamsOf {
  return params.object_type === 'PROG/PX'
    ? {
        object_name: params.object_name,
        object_type: params.object_type,
        container: params.container,
      }
    : { object_name: params.object_name, object_type: params.object_type };
}

export async function fetchWhereUsedReferences(
  utils: WhereUsedSource,
  params: IAdtWhereUsedScopeParamsOf & WhereUsedFilter,
): Promise<IAdtResponse<WhereUsedListRead, IAdtError>> {
  let scopeXml: string | undefined;

  if (needsScope(params)) {
    const scope = await atStep('read where-used scope', () =>
      utils.getWhereUsedScope(whereUsedTarget(params)),
    )();
    if (!scope.ok) {
      return scope;
    }
    const rawScope = scope.getResult().value?.raw ?? '';
    scopeXml = utils.modifyWhereUsedScope(rawScope, {
      enableAll: params.enableAllTypes,
      enableOnly: params.enableOnlyTypes,
      disable: params.disableTypes,
    });
  }

  const result = await atStep('read where-used', () =>
    utils.getWhereUsed({
      ...whereUsedTarget(params),
      ...(scopeXml !== undefined ? { scopeXml } : {}),
    }),
  )();
  if (!result.ok) {
    return result;
  }

  return result;
}
