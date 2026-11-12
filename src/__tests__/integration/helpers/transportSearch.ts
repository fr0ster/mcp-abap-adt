/**
 * Where a transport listing runs: on a system that holds a saved transport
 * search configuration. `ListTransports` runs the system's saved searches
 * (`handleListTransports`); a system holding none answers an empty list of
 * configurations, and the tool refuses — a listing is a saved search, made
 * in ADT's Transport Organizer. The cloud test system holds none (measured
 * on ABAP Cloud, 2026-11-12).
 *
 * The configurations are read through the same adt-clients request the tool
 * makes. A refusal of that read is no reason to skip: it is answered as the
 * failure it is, with SAP's status and text.
 */
import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  transportSearchConfigurations,
} from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { createAdtClient } from '../../../lib/clients';
import { resultsFor } from '../../../lib/strategies/resultSets';

/** The skip reason on a system holding no saved transport search configuration. */
export const NO_TRANSPORT_SEARCH =
  "runs only on a system holding a saved transport search configuration (made in ADT's Transport Organizer); this system holds none";

/**
 * `undefined` when the system holds at least one saved transport search
 * configuration, else the skip reason. A refused read throws SAP's answer.
 */
export async function transportSearchMissing(
  connection: IAbapConnection,
): Promise<string | undefined> {
  const answered = await createAdtClient(connection)
    .getRequest({
      ...resultsFor(transportDocuments),
      searchConfigurations: transportSearchConfigurations,
    })
    .searchConfigurations({ analyse: analyseException });
  if (!answered.ok) {
    const error = answered.getError();
    throw new Error(
      `reading the transport search configurations failed: status ${error.response?.status ?? 'none'}, type ${error.adtType ?? 'none'}: ${error.message}`,
    );
  }
  return answered.getResult().value.length === 0
    ? NO_TRANSPORT_SEARCH
    : undefined;
}
