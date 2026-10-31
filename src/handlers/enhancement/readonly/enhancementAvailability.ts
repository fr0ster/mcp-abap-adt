import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { ADT_TYPES_ONPREM } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { AdtCodes } from '../../../lib/adtProjections';
import { isCredentialFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';

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
 * The search is filtered by the search name of `code`'s main type, read from
 * its entry in the tables (`ENHO`, `ENHS`; spec 3.6): a code is no filter
 * value, and the subtype is in each hit's `adtcore:type`, which the search
 * answers for every subtype of the main type (measured on premise,
 * 2026-10-02).
 */
export async function enhancementTypeOf(
  connection: IAbapConnection,
  name: string,
  code: AdtCodes<'ENHO/XHH' | 'ENHS/XSB'>,
): Promise<string | undefined> {
  const objectType = ADT_TYPES_ONPREM.enhancement.codes[code].main;
  try {
    const searched = await createAdtClient(connection)
      .getUtils(ourUtils)
      .search(
        { query: name, objectType, maxResults: 20 },
        { analyse: analyseException },
      );
    // A search that fails says nothing about the type; the caller keeps the
    // failure it already has.
    if (!searched.ok) return undefined;
    const raw = (searched.getResult().value as AdtReading<unknown>).raw;
    const wanted = name.toUpperCase();
    for (const m of String(raw ?? '').matchAll(
      /<adtcore:objectReference ([^>]*)\/?>/g,
    )) {
      const attrs = m[1];
      if (/adtcore:name="([^"]+)"/.exec(attrs)?.[1]?.toUpperCase() !== wanted)
        continue;
      return /adtcore:type="([^"]+)"/.exec(attrs)?.[1];
    }
  } catch (error) {
    // A credential failure ends the call as it came. Any other search that
    // fails says nothing about the type; the caller keeps the failure it
    // already has.
    if (isCredentialFailure(error)) throw error;
  }
  return undefined;
}
