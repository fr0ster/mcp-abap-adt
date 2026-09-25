import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from './reading';

/**
 * `getWhereUsedList`'s replacement, composed — the guide's "Sequences are
 * yours" table entry: `getWhereUsedScope`, `modifyWhereUsedScope` (no
 * request, a local string edit), `getWhereUsed`.
 *
 * Depending on the three members structurally, not on `AdtUtils` itself —
 * the same boundary `packageWalk.ts`'s `NodeStructureSource` draws — keeps
 * this testable without a client and honest about what it actually calls.
 * Neither `getWhereUsedScope` nor `getWhereUsed` accepts an `options`
 * argument at all in adt-clients 19 (confirmed against `AdtUtils.d.ts`), so
 * there is no `analyse` to inject here — their verdict is the library's own,
 * the same absence the node-structure members in this migration share.
 */
export interface WhereUsedSource {
  getWhereUsedScope(params: {
    object_name: string;
    object_type: string;
  }): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
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
  getWhereUsed(params: {
    object_name: string;
    object_type: string;
    scopeXml?: string;
  }): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attrs(node: unknown): Record<string, string> {
  const a = (node as { '@'?: Record<string, string> } | undefined)?.['@'];
  return a && typeof a === 'object' ? a : {};
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
  const root = (value as Record<string, unknown> | undefined)?.[
    'usagereferences:usageReferenceResult'
  ];
  const rootAttrs = attrs(root);
  const objectsRoot = (root as Record<string, unknown> | undefined)?.[
    'usagereferences:referencedObjects'
  ];
  const rawRefs = (objectsRoot as Record<string, unknown> | undefined)?.[
    'usagereferences:referencedObject'
  ];

  const references: WhereUsedReference[] = asArray(rawRefs as unknown)
    .map((ref) => {
      const refAttrs = attrs(ref);
      const adtObject = (ref as Record<string, unknown> | undefined)?.[
        'usagereferences:adtObject'
      ];
      const adtAttrs = attrs(adtObject);
      const packageRef = (adtObject as Record<string, unknown> | undefined)?.[
        'adtcore:packageRef'
      ];
      const packageAttrs = attrs(packageRef);
      return {
        name: adtAttrs['adtcore:name'] ?? '',
        type: adtAttrs['adtcore:type'] ?? '',
        uri: refAttrs.uri || undefined,
        package_name: packageAttrs['adtcore:name'] || undefined,
        responsible: adtAttrs['adtcore:responsible'] || undefined,
        usage_information: refAttrs.usageInformation || undefined,
      };
    })
    .filter((r) => r.name);

  const declaredTotal = Number(rootAttrs.numberOfResults);
  return {
    totalReferences: Number.isFinite(declaredTotal)
      ? declaredTotal
      : references.length,
    resultDescription: rootAttrs.resultDescription || undefined,
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
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error(
        'fetchWhereUsedReferences: asked for the error of a success',
      );
    },
  } as unknown as IAdtResponse<T, IAdtError>;
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
  params: { object_name: string; object_type: string } & WhereUsedFilter,
): Promise<IAdtResponse<WhereUsedListResult, IAdtError>> {
  let scopeXml: string | undefined;

  if (needsScope(params)) {
    const scope = await utils.getWhereUsedScope({
      object_name: params.object_name,
      object_type: params.object_type,
    });
    if (!scope.ok) {
      return scope as unknown as IAdtResponse<WhereUsedListResult, IAdtError>;
    }
    const rawScope = scope.getResult().value?.raw ?? '';
    scopeXml = utils.modifyWhereUsedScope(rawScope, {
      enableAll: params.enableAllTypes,
      enableOnly: params.enableOnlyTypes,
      disable: params.disableTypes,
    });
  }

  const result = await utils.getWhereUsed({
    object_name: params.object_name,
    object_type: params.object_type,
    ...(scopeXml !== undefined ? { scopeXml } : {}),
  });
  if (!result.ok) {
    return result as unknown as IAdtResponse<WhereUsedListResult, IAdtError>;
  }

  return noResult(parseWhereUsedReferences(result.getResult().value?.value));
}
