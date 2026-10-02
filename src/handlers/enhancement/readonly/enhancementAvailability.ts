import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { makeAdtRequestWithTimeout } from '../../../lib/utils';

/**
 * Enhancement types ADT does not expose. Eclipse ADT opens each in SAP GUI, and
 * the collections answer an error rather than the object: a plain enhancement
 * spot `500 I::000`, a class enhancement `500` (measured on premise, BASIS 816,
 * 2026-10-02). A reader names the type and stops instead of passing that on.
 */
const NOT_THROUGH_ADT: Record<string, string> = {
  'ENHS/XS': 'enhancement spot',
  'ENHO/XH': 'class enhancement',
};

/** Why an enhancement of this type cannot be read through ADT, or `undefined`. */
export function notThroughAdt(name: string, type: string): string | undefined {
  const label = NOT_THROUGH_ADT[type];
  return label
    ? `${name} (${type}, ${label}) is not available through ADT — Eclipse opens it in SAP GUI.`
    : undefined;
}

/**
 * The subtype of an enhancement object (`ENHO/XHH`, `ENHS/XS`, …), read off
 * the repository search; `undefined` when the search does not name it.
 *
 * Asked only after a read failed, so the read that works stays one request.
 * `objectType` is the main type: the search ignores a subtype filter and
 * answers mixed subtypes (measured on premise, 2026-10-02), and the subtype
 * is in each hit's `adtcore:type`.
 */
export async function enhancementTypeOf(
  connection: IAbapConnection,
  name: string,
  objectType: 'ENHO' | 'ENHS',
): Promise<string | undefined> {
  try {
    const response = await makeAdtRequestWithTimeout(
      connection,
      `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(name)}&maxResults=20&objectType=${objectType}`,
      'GET',
      'default',
      undefined,
      undefined,
      { Accept: 'application/xml' },
    );
    const wanted = name.toUpperCase();
    for (const m of String(response.data ?? '').matchAll(
      /<adtcore:objectReference ([^>]*)\/?>/g,
    )) {
      const attrs = m[1];
      if (/adtcore:name="([^"]+)"/.exec(attrs)?.[1]?.toUpperCase() !== wanted)
        continue;
      return /adtcore:type="([^"]+)"/.exec(attrs)?.[1];
    }
  } catch {
    // A search that fails says nothing about the type; the caller keeps the
    // failure it already has.
  }
  return undefined;
}
