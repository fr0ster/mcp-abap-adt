/**
 * The start line (spec §2.3): written once per process after the table is
 * read. It names counts, not entries — but the deny entries that match
 * nothing in this binary, which is how a mistyped name shows — and the
 * strategy only for the tree strategy.
 */
import type { AccessRestrictions } from './accessLists.js';

export function accessStartLine(
  restrictions: AccessRestrictions,
  unmatched: readonly string[],
  tree: boolean,
): string {
  const { deniedActions, lists } = restrictions;
  const clauses = [
    ...(deniedActions.length > 0
      ? [
          `deny-actions ${deniedActions.length}${unmatched.length > 0 ? ` (matching nothing here: ${unmatched.join(', ')})` : ''}`,
        ]
      : []),
    ...(lists.allowedPackages !== undefined
      ? [
          `allowed-packages ${lists.allowedPackages.length}${tree ? ' (package tree read)' : ''}`,
        ]
      : []),
    ...(lists.allowedRequests !== undefined
      ? [`allowed-requests ${lists.allowedRequests.length}`]
      : []),
    ...(lists.deniedTables !== undefined
      ? [`denied-tables ${lists.deniedTables.length}`]
      : []),
    ...(lists.allowedTables !== undefined
      ? [`allowed-tables ${lists.allowedTables.length}`]
      : []),
  ];
  return `[MCP] Access restrictions: ${clauses.length > 0 ? clauses.join(', ') : 'none'}`;
}
