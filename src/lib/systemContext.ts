import { registerConnectionResetHook } from './connectionEvents';
import { getRequestContext } from './requestContext';

export interface IAdtSystemContext {
  masterSystem?: string;
  responsible?: string;
  client?: string;
  /** Master/original language for created objects (adtcore:masterLanguage). From SAP_LANGUAGE; library defaults to EN when unset. */
  masterLanguage?: string;
}

// The process-wide context: the configuration (`systemContextFromConfiguration`)
// or what an embedder states (`setSystemContext`). Per-request values — headers,
// a destination's own .env, a cloud system's answer — live in the request scope
// (requestContext.ts), never here, so they cannot leak between requests.
let cached: IAdtSystemContext | undefined;

/**
 * The system context the configuration states — `SAP_MASTER_SYSTEM`,
 * `SAP_RESPONSIBLE` (else `SAP_USERNAME`), `SAP_LANGUAGE` — merged into the
 * process context, or `undefined` when it states none. It fills only what
 * the process context lacks: a value an embedder stated (`setSystemContext`,
 * `systemContext`) survives every request that sets a context up. Sends
 * nothing.
 */
export function systemContextFromConfiguration():
  | IAdtSystemContext
  | undefined {
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE || process.env.SAP_USERNAME;
  const masterLanguage = process.env.SAP_LANGUAGE;
  if (!masterSystem && !responsible && !masterLanguage) return undefined;
  cached = {
    ...cached,
    masterSystem: cached?.masterSystem || masterSystem,
    responsible: cached?.responsible || responsible,
    masterLanguage: cached?.masterLanguage || masterLanguage,
  };
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
