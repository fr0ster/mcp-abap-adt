/**
 * `mcp-abap-adt-compact-ro` — the read-only compact tool set over stdio.
 *
 * The runtime's stdio `main` (`@mcp-abap-adt/server-runtime/stdio`, the one
 * `mcp-abap-adt` runs) with `compactReadOnlyToolSetOf` over the half that
 * changes nothing, and this command's name and version. Nothing else: core's
 * table, credentials, cancellation, failures and shutdown. The package depends
 * on lib, the runtime and the read-only half, never on another binary package.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The modify
 * half, the debugger, background runs and the resume are `mcp-abap-adt-compact`'s.
 */
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { processEdges } from '@mcp-abap-adt/lib/config';
import {
  compactReadOnlyToolSetOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import {
  main as coreMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/server-runtime/stdio';

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

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const COMPACT_RO_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  return coreMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-compact-ro',
      version: COMPACT_RO_VERSION,
      packageName: COMPACT_RO_PACKAGE,
    },
    edges,
  );
}
