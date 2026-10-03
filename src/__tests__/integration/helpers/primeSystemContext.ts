import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import {
  setSystemContext,
  systemContextFromConfiguration,
} from '../../../lib/systemContext';

/**
 * Fills the process system context for a test that calls handlers or
 * `createAdtClient` directly, outside any server: the configuration
 * (`SAP_MASTER_SYSTEM`, `SAP_RESPONSIBLE` / `SAP_USERNAME`) first, then — on a
 * cloud connection only — what the system's `systeminformation` answers for
 * what the configuration leaves out. The order the server follows, without a
 * request scope.
 */
export async function primeSystemContext(
  connection: IAbapConnection,
): Promise<void> {
  const configured = systemContextFromConfiguration() ?? {};
  if (configured.masterSystem && configured.responsible) return;
  const resolved = await defaultSystemContextResolver(connection).catch(
    () => null,
  );
  if (!resolved) return;
  setSystemContext({
    masterSystem: configured.masterSystem ?? resolved.masterSystem,
    responsible: configured.responsible ?? resolved.responsible,
  });
}
