import type { HandlerSet } from './IServerConfig.js';

/** The transport a binary serves: one binary per transport and tool set (D35, D49). */
export type ServedTransport = 'stdio' | 'http' | 'sse';

/** Each transport's compact binary and its package (D49). */
export const COMPACT_BINARIES: Readonly<
  Record<ServedTransport, { readonly bin: string; readonly pkg: string }>
> = {
  stdio: { bin: 'mcp-abap-adt-compact', pkg: '@mcp-abap-adt/compact' },
  http: { bin: 'mcp-abap-adt-compact-http', pkg: '@mcp-abap-adt/compact-http' },
  sse: { bin: 'mcp-abap-adt-compact-sse', pkg: '@mcp-abap-adt/compact-sse' },
};

/**
 * The handler sets of an `--exposition` list. `compact` is kept on purpose,
 * so `validateExposition` can refuse it by name and say which command serves
 * it; any other word is dropped (the full tool set refuses one before it gets
 * here, `expositionProblem`), and a list with no set left is the default
 * (readonly,high), as main reads it.
 */
export function toHandlerSets(
  values: readonly string[] | undefined,
): HandlerSet[] {
  const sets = (values ?? []).filter(
    (s): s is HandlerSet =>
      s === 'readonly' || s === 'high' || s === 'compact' || s === 'debug',
  );
  return sets.length > 0 ? sets : ['readonly', 'high'];
}

/**
 * The HANDLER EXPOSITION section of the help of the full tool set, naming the
 * compact binary of the binary's own transport.
 */
export function expositionHelp(transport: ServedTransport = 'stdio'): string {
  const { bin, pkg } = COMPACT_BINARIES[transport];
  return `
HANDLER EXPOSITION:
  --exposition=<sets>              Comma-separated handler sets to expose
                                   Options: readonly, high, debug
                                   Default: readonly,high

                                   Handler Sets:
                                   - readonly: Get*, Check*, Validate*, Lock*, Unlock*
                                               (read operations, validation, locking)
                                               Also includes: search, system
                                   - high:     Create*, Update*, Delete*, Activate*
                                               (each a whole workflow via ADT)
                                   - debug:    the debugger tools; opt-in, never part of the
                                               default. A breakpoint or a listener catches
                                               every request of the connected SAP user
                                   - search:   SearchObject (included with readonly)
                                   - system:   GetWhereUsed, GetTypeInfo, GetObjectInfo,
                                               GetAbapAST, GetSession, etc.
                                               (included with readonly)

                                   Examples:
                                   --exposition=readonly       (readonly + search + system)
                                   --exposition=readonly,high  (readonly + high + search + system)
                                   --exposition=high           (high + search, no system)
                                   --exposition=readonly,debug (readonly + debug + search + system)

                                   The low set is gone from this command (19.0.0):
                                   --exposition=...,low is refused. Its single-step
                                   operations (lock, write under a lock, unlock,
                                   check, validate, activate) are the compact
                                   command's.

                                   The compact facade is NOT an exposition of this
                                   command. It is its own command, with that tool
                                   list as its default:
                                     npm i -g ${pkg}
                                     ${bin}
                                   This command refuses --exposition=compact (and
                                   compact's ro, rw) and says the same; any other
                                   word outside the sets above is refused too.

                                   For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
}
