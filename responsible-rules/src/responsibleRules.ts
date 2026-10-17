/**
 * The rules that make a connection's parameters — the responsible and the
 * master system every call on it takes, which also name the debugger's
 * request user and a background run's caller — from its system's
 * `systeminformation`, once, when the connection is created (stdio: at the
 * start; SSE: per stream; Streamable HTTP: per instance's connection).
 *
 * A destination is the credentials and the ABAP system. `systeminformation`
 * with the information wins. Without it:
 * - ABAP Cloud (which always has it) — one step to the error: a `404` is a
 *   destination whose configuration or headers are inconsistent
 *   (`cloud_without_systeminformation`); anything else the ABAP system's
 *   problem (`system_lookup_failed`);
 * - on-premise — two steps: the stated responsible, else the login; neither
 *   is `system_user_unknown`. The master system is the stated one.
 * - no kind stated is `system_type_required`: the kind is never guessed.
 *
 * A credential failure (a `401`) never reaches here: lib passes it through
 * as it came. Parameters made are kept with the connection and its
 * destination; a refusal keeps nothing, and the next connection tries
 * again. The refusals' codes and words are lib's (`ServerRefusal`).
 */
import { ServerRefusal } from '@mcp-abap-adt/lib/auth';
import type {
  ResolvedSystemContext,
  SystemCall,
  SystemContextRules,
  SystemLookup,
} from '@mcp-abap-adt/lib/request-context';

/** `value` when it is a non-blank string, else `undefined`. */
function stated(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** The parameters by the rules; throws the call's refusal. */
function parametersFor(
  lookup: SystemLookup,
  call: SystemCall,
): ResolvedSystemContext {
  if (lookup.system !== null) return lookup.system;
  if (call.kind === undefined) {
    throw new ServerRefusal('system_type_required');
  }
  if (call.kind === 'cloud') {
    if (lookup.absent) {
      call.warn(
        'The ABAP Cloud destination has no systeminformation endpoint: the configuration or the headers are inconsistent',
      );
      throw new ServerRefusal('cloud_without_systeminformation');
    }
    call.warn(
      'Could not resolve responsible/master system from the connection: the ABAP Cloud system gave no systeminformation',
    );
    throw new ServerRefusal('system_lookup_failed');
  }
  const user = stated(call.responsible) ?? stated(call.login);
  if (user === undefined) {
    call.warn(
      'The system gave no systeminformation and the call states no user: the session user is unknown',
    );
    throw new ServerRefusal('system_user_unknown');
  }
  return { responsible: user, masterSystem: stated(call.masterSystem) };
}

/**
 * The responsible rules, for lib's `systemContextRules` option
 * (`BaseMcpServer`, `EmbeddableMcpServer`, `HandlerExporter`, a handler
 * group's context). core, http and sse pass them with lib's
 * `defaultSystemContextResolver`.
 */
export const responsibleRules: SystemContextRules = { parametersFor };
