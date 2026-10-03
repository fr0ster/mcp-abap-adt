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

// The process login (`SAP_USERNAME`), kept apart from `cached.responsible`:
// it is the responsible only after every stated one — the request's, the
// destination's, the process's own `SAP_RESPONSIBLE` — and after the
// request's own login.
let processLogin: string | undefined;

/**
 * The system context the configuration states — `SAP_MASTER_SYSTEM`,
 * `SAP_RESPONSIBLE`, `SAP_LANGUAGE` — merged into the process context, or
 * `undefined` when it states none; and `SAP_USERNAME`, the process login, kept
 * as the last fallback for the responsible (`getEffectiveSystemContext`). It
 * fills only what the process context lacks: a value an embedder stated
 * (`setSystemContext`, `systemContext`) survives every request that sets a
 * context up. Sends nothing.
 */
export function systemContextFromConfiguration():
  | IAdtSystemContext
  | undefined {
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE;
  const masterLanguage = process.env.SAP_LANGUAGE;
  processLogin = processLogin || process.env.SAP_USERNAME || undefined;
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
 * The responsible is always the first of: what is stated (the request scope's
 * `responsible` — `x-sap-responsible`, the destination's `SAP_RESPONSIBLE` —
 * then the process context's — `SAP_RESPONSIBLE`, `setSystemContext`), else
 * the login (the scope's `login` — the destination's `SAP_USERNAME`, or the
 * `x-sap-login` of an `x-sap-*` basic connection — then the process
 * `SAP_USERNAME`). On a cloud connection the login is the system's user only:
 * `withResolvedSystemContext` replaces these login fallbacks there. A create
 * that finds none is refused (`systemContextGuard.ts`).
 *
 * Outside a request scope (stdio) the process values apply. Inside one:
 * - `masterLanguage` comes only from the scope (#110): a scope without it does
 *   not inherit the process value.
 * - `responsible` and `masterSystem` come from the scope when the scope carries
 *   the key, an explicit `undefined` included — and a scope carrying
 *   `responsible` also masks the process login. That lets a host serving
 *   several SAP users from one process give each request its own, where the
 *   process values would hand every concurrent request the same user. A scope
 *   that does not carry the key keeps the process value, so a host that only
 *   scopes the language keeps the responsible it resolved from its environment
 *   or the system.
 */
export function getEffectiveSystemContext(): IAdtSystemContext {
  const stated = getStatedSystemContext();
  if (stated.responsible) return stated;
  const req = getRequestContext();
  // A scope carrying `responsible` masks the process login too.
  const login =
    req && 'responsible' in req ? req.login : req?.login || processLogin;
  return login ? { ...stated, responsible: login } : stated;
}

/**
 * The system context as the current request states it, without the login
 * fallback: the same rules as `getEffectiveSystemContext`, but a responsible
 * is only one stated (`x-sap-responsible`, `SAP_RESPONSIBLE`,
 * `setSystemContext`, a scope's `responsible`). On a cloud connection this is
 * what `withResolvedSystemContext` keeps; the system's user stands in for the
 * login there.
 */
export function getStatedSystemContext(): IAdtSystemContext {
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
  processLogin = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
