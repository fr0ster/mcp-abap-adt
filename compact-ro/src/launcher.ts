/**
 * `mcp-abap-adt-compact-ro` — the read-only compact tool set over stdio.
 *
 * core's `main` with `compactReadOnlyToolSetOf` over the half that changes
 * nothing, and this command's name and version. Nothing else: core's table,
 * credentials, cancellation, failures and shutdown.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The modify
 * half, the debugger, background runs and the resume are `mcp-abap-adt-compact`'s.
 */
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import {
  main as coreMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/core/launcher';
import { processEdges } from '@mcp-abap-adt/lib/config';
import {
  compactReadOnlyToolSetOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';

/**
 * The read-only compact tool set: the half that changes nothing, and the
 * leftover-session list and logoff. No modify half, no debugger, no
 * background run, no resume.
 */
export const readOnlyToolSet: ToolSet = compactReadOnlyToolSetOf(
  compactReadOnlyEntries,
);

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const COMPACT_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

export function main(
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  return coreMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-compact-ro',
      version: COMPACT_RO_VERSION,
    },
    edges,
  );
}
