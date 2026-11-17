import { registerConnectionResetHook } from './connectionEvents';
import { getRequestContext } from './requestContext';

export interface IAdtSystemContext {
  masterSystem?: string | undefined;
  responsible?: string | undefined;
  /** Original language for created objects, from SAP_LANGUAGE: a create given none states this one (#348); unset, a create states none and SAP takes its logon language. */
  masterLanguage?: string | undefined;
}

// The process-wide context: the configuration (`systemContextFromConfiguration`).
// An embedder states its own on the server's options (`systemContext`, per
// instance). Per-request values — headers,
// a destination's own .env, a cloud system's answer — live in the request scope
// (requestContext.ts), never here, so they cannot leak between requests.
let cached: IAdtSystemContext | undefined;

/**
 * The system context the configuration states — `SAP_MASTER_SYSTEM`,
 * `SAP_RESPONSIBLE`, `SAP_LANGUAGE` — merged into the process context, or
 * `undefined` when it states none. It fills only what the process context
 * lacks. An embedder's `systemContext` is the instance's, entered per call,
 * never this one. Sends nothing.
 *
 * The environment read here is the process's own: no destination's `.env`
 * joins it (24.0.0). A destination's master language is its `SAP_LANGUAGE`
 * in effect, handed with its system context (`withDestinationSystemContext`),
 * and beats this process value.
 */
export function systemContextFromConfiguration():
  | IAdtSystemContext
  | undefined {
  const masterSystem = process.env.SAP_MASTER_SYSTEM;
  const responsible = process.env.SAP_RESPONSIBLE;
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
 * The system context as the current request states it — what a call reads
 * (a create's responsible). A responsible is only one stated
 * (`x-sap-responsible`, `SAP_RESPONSIBLE`, an instance's `systemContext`, a
 * scope's `responsible`) or the connection's parameters (made by a host's rules,
 * `withKnownSystemContext`); no login stands in for it here.
 *
 * Outside a request scope (stdio) the process values apply. Inside one:
 * - `masterLanguage` comes only from the scope (#110): a scope without it does
 *   not inherit the process value.
 * - `responsible` and `masterSystem` come from the scope when the scope carries
 *   the key, an explicit `undefined` included. That lets a host serving
 *   several SAP users from one process give each request its own, where the
 *   process values would hand every concurrent request the same user. A scope
 *   that does not carry the key keeps the process value.
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
 * The system context a create sends: `getStatedSystemContext`, its
 * responsible, when none is stated, the login the request scope states
 * (the value the debugger's request user and a background run's caller
 * take). No login stated either: the responsible stays empty, and the
 * change is refused. The process environment's `SAP_USERNAME` is never read.
 */
export function getCreateSystemContext(): IAdtSystemContext {
  const ctx = getStatedSystemContext();
  if (ctx.responsible?.trim()) return ctx;
  const login = getRequestContext()?.login;
  return login?.trim() ? { ...ctx, responsible: login } : ctx;
}

export function resetSystemContextCache() {
  cached = undefined;
}

registerConnectionResetHook(resetSystemContextCache);
