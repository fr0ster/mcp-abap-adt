/**
 * `mcp-abap-adt-ro` — the read-only tool set over stdio (C23).
 *
 * core's `main` with `fullReadOnlyToolSet`, and this command's name and
 * version. Nothing else: core's table, credentials, cancellation, failures and
 * shutdown.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision, C23), and a user installs only what they need. The high,
 * debugger, background-run and resume tools are `mcp-abap-adt`'s.
 */
import {
  main as coreMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/core/launcher';
import { processEdges } from '@mcp-abap-adt/lib/config';
import { fullReadOnlyToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';

/**
 * The read-only tool set: readonly (with system and search), and the
 * leftover-session list and logoff. No high, no debugger, no background run,
 * no resume.
 */
export const readOnlyToolSet: ToolSet = fullReadOnlyToolSet;

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const CORE_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

export function main(
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  return coreMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-ro',
      version: CORE_RO_VERSION,
    },
    edges,
  );
}
