/**
 * The debugger's SAP ids — the consumer's to choose, and what bounds parallel
 * debug sessions: SAP answers a second listener under the same pair with its
 * conflict (or the take-over tools displace the first), and another pair is
 * another listener. Nothing of ours limits them. Generated unless stated: two
 * instances of one user with the same ids would share one listener's catches
 * without a conflict (the same `ideId` never conflicts — measured). A user who
 * wants otherwise states them — a header, the destination, the environment;
 * what a shared id brings is theirs. Not validated: SAP judges them.
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
