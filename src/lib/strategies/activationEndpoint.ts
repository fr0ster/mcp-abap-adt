/**
 * Which endpoint a group activation takes, by the system's discovery
 * (fr0ster/mcp-abap-adt#351): the activation runs where the discovery lists
 * `/sap/bc/adt/activation/runs`, else the one synchronous
 * `POST /sap/bc/adt/activation` (`activateObjects`) — SAP_BASIS 751 with a
 * partial discovery, and 7.40. `ActivateObjectLow`'s group path, the
 * unit-test writer's function-group activation and the admin shared setup
 * decide by it.
 */
import {
  ACTIVATION_RUNS_COLLECTION,
  analyseException,
  utilDiscoveryCollections,
} from '@mcp-abap-adt/adt-strategies';
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';
import { ourUtils } from './resultSets';
import { failedWith, succeededWith } from './sequence';
import { withStep } from './step';

/** The step a discovery read and its failure arise at. */
export const DISCOVERY = 'discovery';

/** A discovery SAP answered with no collection: the fixed words. */
export const DISCOVERY_UNREADABLE =
  'The discovery could not be read: SAP answered no collection, so whether the system offers /sap/bc/adt/activation/runs is not known, and the activation endpoint is not decided. Nothing was activated.';

/**
 * Whether the system offers `/sap/bc/adt/activation/runs`, by its discovery,
 * read on every group activation (owner, fr0ster/mcp-abap-adt#351: no state
 * kept). Exact membership (`ACTIVATION_RUNS_COLLECTION`), never a prefix.
 * A discovery that fails, or answers no collection, is the call's failure at
 * step `discovery`: no endpoint is guessed and nothing is tried to find out.
 */
export async function activationRunsOffered(
  context: Pick<HandlerContext, 'connection' | 'logger'>,
) {
  const read = await createAdtClient(context.connection, context.logger)
    .getUtils({ ...ourUtils, discovery: utilDiscoveryCollections })
    .discovery({}, { analyse: analyseException });
  if (!read.ok)
    return failedWith<boolean>(withStep(read.getError(), DISCOVERY));
  const collections = read.getResult().value;
  if (collections.size === 0) {
    return failedWith<boolean>(
      withStep({ origin: 'refusal', message: DISCOVERY_UNREADABLE }, DISCOVERY),
    );
  }
  return succeededWith(collections.has(ACTIVATION_RUNS_COLLECTION));
}
