/**
 * Whether the system a connection reaches serves abapGit through ADT: its
 * discovery lists `/sap/bc/adt/abapgit/repos` (spec §4.5). Discovery does
 * not tell the two route sets apart (spec §2.1): the route set is the
 * system kind's, whether abapGit is there at all the discovery's.
 *
 * The answer is kept by the system the connection reaches (its system key,
 * `adtSystemKey`), never by `state_handle` or instance, for the process: no
 * clock expires it. A failed or unreadable discovery is not kept — that
 * request answers "not served" (fail closed) and the next one reads again.
 * The connection-reset hook drops every kept answer.
 */

import {
  analyseException,
  utilDiscoveryCollections,
} from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { createAdtClient } from '../clients';
import { registerConnectionResetHook } from '../connectionEvents';
import { ourUtils } from '../strategies/resultSets';

/** The collection whose presence in the discovery means abapGit is served. */
export const ABAPGIT_REPOS_COLLECTION = '/sap/bc/adt/abapgit/repos';

/** The kept answers, by system key. */
const servedBySystem = new Map<string, boolean>();

registerConnectionResetHook(() => {
  servedBySystem.clear();
});

/**
 * Whether the system `connection` reaches serves abapGit. `system` is that
 * system's key (`adtSystemKey`); `undefined` when it cannot be named — the
 * answer is then read and not kept. One discovery read per system key while
 * an answer is kept; a failed read, or a discovery that answers no
 * collection, answers `false` and keeps nothing.
 */
export async function abapGitServed(
  connection: IAbapConnection,
  system: string | undefined,
  logger?: ILogger,
): Promise<boolean> {
  if (system !== undefined) {
    const kept = servedBySystem.get(system);
    if (kept !== undefined) return kept;
  }
  let collections: ReadonlySet<string>;
  try {
    const read = await createAdtClient(connection, logger)
      .getUtils({ ...ourUtils, discovery: utilDiscoveryCollections })
      .discovery({}, { analyse: analyseException });
    if (!read.ok) return false;
    collections = read.getResult().value;
  } catch {
    return false;
  }
  if (collections.size === 0) return false;
  const served = collections.has(ABAPGIT_REPOS_COLLECTION);
  if (system !== undefined) servedBySystem.set(system, served);
  return served;
}
