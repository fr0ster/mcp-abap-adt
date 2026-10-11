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
 * Stated ids where given, random ones elsewhere. `stated` is true when either
 * id came from configuration: only a stated id can have a predecessor to
 * reconcile with.
 */
export function resolveDebuggerIds(
  env: NodeJS.ProcessEnv = process.env,
): DebuggerIds & { stated: boolean } {
  const stated = statedDebuggerIds(env);
  return {
    terminalId: stated.terminalId ?? newDebuggerId(),
    ideId: stated.ideId ?? newDebuggerId(),
    stated: stated.terminalId !== undefined || stated.ideId !== undefined,
  };
}
