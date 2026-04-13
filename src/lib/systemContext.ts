import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
  client?: string;
  isLegacy?: boolean;
}

// Singleton cache is sufficient: one MCP session always maps to one SAP system.
// For HTTP/SSE the cache is reset before each request as a safety measure.
let cached: IAdtSystemContext | undefined;

/**
 * Detect whether the connected system is legacy (BASIS < 7.50).
 *
 * Uses SAP_SYSTEM_TYPE env var (default: cloud).
 * Auto-detection via /sap/bc/adt/core/discovery was removed because it is
 * unreliable — the result depends on shell environment, proxy config, and
 * whether the ICM port requires a pre-established session.
 *
 *   SAP_SYSTEM_TYPE=legacy  → legacy (BASIS < 7.50)
 *   SAP_SYSTEM_TYPE=onprem  → modern on-premise
 *   SAP_SYSTEM_TYPE=cloud   → modern cloud (default)
 */
function detectLegacy(): boolean {
  return process.env.SAP_SYSTEM_TYPE?.toLowerCase() === 'legacy';
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
      isLegacy: cached?.isLegacy ?? detectLegacy(),
    };
    return cached;
  }

  if (cached) return cached;

  // Detect legacy from SAP_SYSTEM_TYPE (default: cloud → not legacy)
  const isLegacy = detectLegacy();

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
      client: info?.client,
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

/**
 * Set system context explicitly (safe, no HTTP requests).
 * Use this when system info is known upfront (e.g., from BTP destination metadata).
 */
export function setSystemContext(context: Partial<IAdtSystemContext>): void {
  cached = {
    ...cached,
    ...context,
    isLegacy: context.isLegacy ?? cached?.isLegacy ?? detectLegacy(),
  };
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
