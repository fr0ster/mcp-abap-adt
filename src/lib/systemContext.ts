import {
  getSystemInformation,
  isModernAdtSystem,
} from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
  isLegacy?: boolean;
}

// Singleton cache is sufficient: one MCP session always maps to one SAP system.
// For HTTP/SSE the cache is reset before each request as a safety measure.
let cached: IAdtSystemContext | undefined;

/**
 * Detect whether the connected system is legacy (BASIS < 7.50).
 * Modern systems expose /sap/bc/adt/core/discovery; legacy ones do not.
 */
async function detectLegacy(connection: IAbapConnection): Promise<boolean> {
  try {
    return !(await isModernAdtSystem(connection));
  } catch {
    return false;
  }
}

export async function resolveSystemContext(
  connection: IAbapConnection,
  overrides?: Partial<IAdtSystemContext>,
): Promise<IAdtSystemContext> {
  // Priority 1: explicit overrides (from HTTP headers)
  if (overrides && (overrides.masterSystem || overrides.responsible)) {
    cached = {
      masterSystem: overrides.masterSystem,
      responsible: overrides.responsible,
      isLegacy: cached?.isLegacy ?? (await detectLegacy(connection)),
    };
    return cached;
  }

  if (cached) return cached;

  // Detect legacy once per connection
  const isLegacy = await detectLegacy(connection);

  // Priority 2: env vars (on-prem or explicitly configured)
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE || process.env.SAP_USERNAME;

  if (masterSystem || responsible) {
    cached = { masterSystem, responsible, isLegacy };
    return cached;
  }

  // Cloud: try getSystemInformation API
  try {
    const info = await getSystemInformation(connection);
    cached = {
      masterSystem: info?.systemID,
      responsible: info?.userName,
      isLegacy,
    };
  } catch {
    cached = { isLegacy };
  }

  return cached;
}

export function getSystemContext(): IAdtSystemContext {
  return cached || {};
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
