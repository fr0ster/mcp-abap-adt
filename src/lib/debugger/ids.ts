/**
 * The debugger's SAP ids, as measured: the same `ideId` never conflicts — two
 * listeners under it both stay, and the newer one catches; another `ideId` of
 * the same SAP user meets SAP's listener conflict (409 under refuse,
 * displacement under take-over). Breakpoints belong to the SAP user, not to an
 * id: whichever listener of that user is active catches them. Both ids are
 * random per instance by default, so a second instance of the same SAP user
 * meets that conflict. A shared id
 * is the consumer's explicit choice — a header, the destination, the
 * environment — and what it brings is theirs. Nothing of ours limits
 * listeners. Not validated: SAP judges them.
 */
import { randomBytes } from 'node:crypto';
import { getRequestContext } from '../requestContext';

export interface DebuggerIds {
  terminalId: string;
  ideId: string;
}

/** 32 upper-case hex characters. */
export function newDebuggerId(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

/**
 * The ids the user states, each on its own: the request scope (a header, or
 * the destination's `.env` entered into it), then the environment.
 */
export function statedDebuggerIds(
  env: NodeJS.ProcessEnv = process.env,
): Partial<DebuggerIds> {
  const scope = getRequestContext();
  const terminalId =
    scope?.debugTerminalId || env.SAP_DEBUG_TERMINAL_ID?.trim() || undefined;
  const ideId = scope?.debugIdeId || env.SAP_DEBUG_IDE_ID?.trim() || undefined;
  return {
    ...(terminalId ? { terminalId } : {}),
    ...(ideId ? { ideId } : {}),
  };
}

/**
 * Stated ids where given, random ones elsewhere. Only a stated id can have a
 * predecessor to reconcile with: `stated` is true when either id came from
 * configuration (user mode), `terminalStated` when the terminal id did
 * (terminal mode). Terminal mode itself needs no stated terminal id: the runs
 * this server starts carry the ids they are caught by, random ones included.
 */
export function resolveDebuggerIds(
  env: NodeJS.ProcessEnv = process.env,
): DebuggerIds & { stated: boolean; terminalStated: boolean } {
  const stated = statedDebuggerIds(env);
  return {
    terminalId: stated.terminalId ?? newDebuggerId(),
    ideId: stated.ideId ?? newDebuggerId(),
    stated: stated.terminalId !== undefined || stated.ideId !== undefined,
    terminalStated: stated.terminalId !== undefined,
  };
}

/**
 * What a change does to the breakpoints another IDE of the same SAP user holds
 * under the same key: `replace` sends the full list, `refuse-if-held` first asks
 * whether another IDE holds the key and refuses if so (under listener mode
 * refuse a start and a replacement ask in either case). The host's choice,
 * stated like the ids: the request scope (a header, or the destination's
 * `.env` entered into it), then the environment, then the embedder's option.
 */
export type BreakpointConflict = 'replace' | 'refuse-if-held';
const BREAKPOINT_CONFLICTS: readonly string[] = ['replace', 'refuse-if-held'];

export function resolveBreakpointConflict(
  fallback?: BreakpointConflict,
  env: NodeJS.ProcessEnv = process.env,
): BreakpointConflict {
  const stated =
    getRequestContext()?.debugBreakpointConflict?.trim() ||
    env.SAP_DEBUG_BREAKPOINT_CONFLICT?.trim() ||
    fallback ||
    'replace';
  if (!BREAKPOINT_CONFLICTS.includes(stated))
    throw new Error(
      `SAP_DEBUG_BREAKPOINT_CONFLICT: ${stated} is neither replace nor refuse-if-held`,
    );
  return stated as BreakpointConflict;
}
