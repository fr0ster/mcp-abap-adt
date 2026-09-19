import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { registerConnectionResetHook } from './connectionEvents';
import { getRequestContext } from './requestContext';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
  client?: string;
  /** Master/original language for created objects (adtcore:masterLanguage). From SAP_LANGUAGE; library defaults to EN when unset. */
  masterLanguage?: string;
}

// Singleton cache is sufficient: one MCP session always maps to one SAP system.
// For HTTP/SSE the cache is reset before each request as a safety measure.
let cached: IAdtSystemContext | undefined;

/**
 * The system context: who the caller is, which system, which language.
 *
 * **Legacy (BASIS < 7.50) is not resolved here any more, and no tool declares
 * it.** Support for it is parked on `parked/legacy-support` until it can be
 * tried against a live legacy system: nothing in this repository ever was,
 * and an `available_in` that named an environment nobody had verified is a
 * claim rather than a fact. `SAP_SYSTEM_TYPE=legacy` now resolves like any
 * other unknown value — the context carries no legacy flag and
 * `createAdtClient` builds the ordinary `AdtClient`.
 */
export async function resolveSystemContext(
  connection: IAbapConnection,
  overrides?: Partial<IAdtSystemContext>,
): Promise<IAdtSystemContext> {
  // Priority 1: explicit overrides (from HTTP headers)
  if (overrides && (overrides.masterSystem || overrides.responsible)) {
    cached = {
      masterSystem: overrides.masterSystem,
      responsible: overrides.responsible,
      masterLanguage: overrides.masterLanguage ?? process.env.SAP_LANGUAGE,
    };
    return cached;
  }

  if (cached) return cached;

  // Priority 2: env vars (on-prem or explicitly configured)
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE || process.env.SAP_USERNAME;
  const masterLanguage = process.env.SAP_LANGUAGE;

  if (masterSystem || responsible || masterLanguage) {
    cached = { masterSystem, responsible, masterLanguage };
    return cached;
  }

  // Cloud: try getSystemInformation API
  try {
    const info = await getSystemInformation(connection);
    cached = {
      masterSystem: info?.systemID,
      responsible: info?.userName,
      client: info?.client,
      masterLanguage,
    };
  } catch {
    cached = { masterLanguage };
  }

  return cached;
}

export function getSystemContext(): IAdtSystemContext {
  return cached || {};
}

/**
 * The system context as the current request sees it.
 *
 * Outside a request scope (stdio) this is the process context. Inside one:
 * - `masterLanguage` comes only from the scope (#110): a scope without it does
 *   not inherit the process value.
 * - `responsible` and `masterSystem` come from the scope when the scope carries
 *   the key, an explicit `undefined` included. That lets a host serving several
 *   SAP users from one process give each request its own, where the process
 *   cache would hand every concurrent request whichever user wrote last. A scope
 *   that does not carry the key keeps the process value, so a host that only
 *   scopes the language keeps the responsible it resolved from its environment
 *   or the system.
 */
export function getEffectiveSystemContext(): IAdtSystemContext {
  const ctx = getSystemContext();
  const req = getRequestContext();
  if (!req) return ctx;
  return {
    ...ctx,
    masterLanguage: req.masterLanguage,
    responsible: 'responsible' in req ? req.responsible : ctx.responsible,
    masterSystem: 'masterSystem' in req ? req.masterSystem : ctx.masterSystem,
  };
}

/**
 * Set system context explicitly (safe, no HTTP requests).
 * Use this when system info is known upfront (e.g., from BTP destination metadata).
 */
export function setSystemContext(context: Partial<IAdtSystemContext>): void {
  cached = {
    ...cached,
    ...context,
  };
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
