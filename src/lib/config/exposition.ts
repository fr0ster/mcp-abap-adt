import type { HandlerSet } from './IServerConfig.js';

/**
 * The handler sets of an `--exposition` list. `compact` is kept on purpose,
 * so `validateExposition` can refuse it by name and say which command serves
 * it; any other word is dropped, and a list with no set left is the default
 * (readonly,high), as main reads it.
 */
export function toHandlerSets(
  values: readonly string[] | undefined,
): HandlerSet[] {
  const sets = (values ?? []).filter(
    (s): s is HandlerSet =>
      s === 'readonly' ||
      s === 'high' ||
      s === 'low' ||
      s === 'compact' ||
      s === 'debug',
  );
  return sets.length > 0 ? sets : ['readonly', 'high'];
}

/** The HANDLER EXPOSITION section of the help of the full tool set. */
export function expositionHelp(): string {
  return `
HANDLER EXPOSITION:
  --exposition=<sets>              Comma-separated handler sets to expose
                                   Options: readonly, high, low, debug
                                   Default: readonly,high

                                   Handler Sets:
                                   - readonly: Get*, Check*, Validate*, Lock*, Unlock*
                                               (read operations, validation, locking)
                                               Also includes: search, system
                                   - high:     Create*, Update*High
                                               (safe create/update via ADT)
                                   - low:      Update*Low, Delete*, Activate*
                                               (direct/dangerous operations)
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
                                   --exposition=readonly,low   (readonly + low + search + system)
                                   --exposition=high           (high + search, no system)
                                   --exposition=readonly,debug (readonly + debug + search + system)

                                   'high' and 'low' are mutually exclusive and the
                                   pair is refused at startup, so there is no value
                                   that serves every handler at once.

                                   The compact facade is NOT an exposition of this
                                   command. It is its own command, with that tool
                                   list as its default:
                                     npm i -g @mcp-abap-adt/compact
                                     mcp-abap-adt-compact
                                   This command refuses --exposition=compact and
                                   says the same.

                                   For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
}
