import type {
  IAdtError,
  IAdtHeaders,
  IAdtResponse,
  IAdtWhereUsedParamsOf,
  IAdtWhereUsedScopeParamsOf,
} from '@mcp-abap-adt/interfaces-adt';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import { attr, child, childAt, listOf } from '../xml/tree';
import type { AdtReading } from './reading';
import { atStep } from './step';
import { succeeded } from './stepResponse';

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
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
  /** Local — issues no request. */
  modifyWhereUsedScope(
    scopeXml: string,
    options: {
      enableAll?: boolean;
      enableOnly?: string[];
      enable?: string[];
      disable?: string[];
    },
  ): string;
  getWhereUsed(
    params: IAdtWhereUsedParamsOf,
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
}

/**
 * The utilities' three where-used members as adt-clients declares them: the
 * two requests take their header pair (`options.headers`).
 */
export interface WhereUsedMembers {
  getWhereUsedScope(
    params: IAdtWhereUsedScopeParamsOf,
    options: { headers: IAdtHeaders },
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
  modifyWhereUsedScope: WhereUsedSource['modifyWhereUsedScope'];
  getWhereUsed(
    params: IAdtWhereUsedParamsOf,
    options: { headers: IAdtHeaders },
  ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
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

export interface WhereUsedReference {
  name: string;
  type: string;
  uri?: string;
  package_name?: string;
  responsible?: string;
  usage_information?: string;
}

export interface WhereUsedListResult {
  totalReferences: number;
  resultDescription?: string;
  references: WhereUsedReference[];
}

export interface WhereUsedFilter {
  enableAllTypes?: boolean;
  enableOnlyTypes?: string[];
  disableTypes?: string[];
}

/** The attribute `name` of `node`'s attribute group (`@`). */
function attrOf(node: unknown, name: string): string | undefined {
  return attr(child(node, '@'), name);
}

/**
 * Walk `structured`'s parse of `/usageReferences`'s response document —
 * `usagereferences:usageReferenceResult` /
 * `usagereferences:referencedObjects/usagereferences:referencedObject`,
 * fields read off each entry's own attributes and its nested `adtObject`,
 * matched field-for-field against the fields the removed `getWhereUsedList`
 * answered (`name`, `type`, `uri`, `package_name`, `responsible`,
 * `usage_information`) — measured against
 * `tests/fixtures/adt/read-where-used-list-structure--01-informationsystem-
 * usagereferences.body.xml`, the one captured fixture for this endpoint.
 */
export function parseWhereUsedReferences(value: unknown): WhereUsedListResult {
  const root = child(value, 'usagereferences:usageReferenceResult');
  const rawRefs = childAt(
    root,
    'usagereferences:referencedObjects',
    'usagereferences:referencedObject',
  );

  const references: WhereUsedReference[] = listOf(rawRefs)
    .map((ref) => {
      const adtObject = child(ref, 'usagereferences:adtObject');
      const packageRef = child(adtObject, 'adtcore:packageRef');
      return {
        name: attrOf(adtObject, 'adtcore:name') ?? '',
        type: attrOf(adtObject, 'adtcore:type') ?? '',
        uri: attrOf(ref, 'uri') || undefined,
        package_name: attrOf(packageRef, 'adtcore:name') || undefined,
        responsible: attrOf(adtObject, 'adtcore:responsible') || undefined,
        usage_information: attrOf(ref, 'usageInformation') || undefined,
      };
    })
    .filter((r) => r.name);

  const declaredTotal = Number(attrOf(root, 'numberOfResults'));
  return {
    totalReferences: Number.isFinite(declaredTotal)
      ? declaredTotal
      : references.length,
    resultDescription: attrOf(root, 'resultDescription') || undefined,
    references,
  };
}

function needsScope(filter: WhereUsedFilter): boolean {
  return Boolean(
    filter.enableAllTypes ||
      (filter.enableOnlyTypes && filter.enableOnlyTypes.length > 0) ||
      (filter.disableTypes && filter.disableTypes.length > 0),
  );
}

function noResult<T>(value: T): IAdtResponse<T, IAdtError> {
  return succeeded(value, 'fetchWhereUsedReferences');
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
export async function fetchWhereUsedReferences(
  utils: WhereUsedSource,
  params: IAdtWhereUsedScopeParamsOf & WhereUsedFilter,
): Promise<IAdtResponse<WhereUsedListResult, IAdtError>> {
  let scopeXml: string | undefined;

  if (needsScope(params)) {
    const scope = await atStep('read where-used scope', () =>
      utils.getWhereUsedScope({
        object_name: params.object_name,
        object_type: params.object_type,
      }),
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
      object_name: params.object_name,
      object_type: params.object_type,
      ...(scopeXml !== undefined ? { scopeXml } : {}),
    }),
  )();
  if (!result.ok) {
    return result;
  }

  return noResult(parseWhereUsedReferences(result.getResult().value?.value));
}
