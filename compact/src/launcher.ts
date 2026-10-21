/**
 * `mcp-abap-adt-compact` — the compact tool set over stdio.
 *
 * The same server as `mcp-abap-adt`, a different decomposition of its tool
 * list: the runtime's stdio `main` (`@mcp-abap-adt/server-runtime/stdio`, the one
 * `mcp-abap-adt` runs) with `compactToolSet` — the two halves' entry builders
 * composed by lib's `compactToolSetOf` — and this command's name and version.
 * Nothing else: core's table, core's
 * destination, credentials, cancellation, failures and shutdown. The package
 * depends on lib, the runtime,
 * background-runs-memory, responsible-rules and the two halves, never on another binary
 * package.
 *
 * **Why a command at all**, rather than a flag on the first one: the host this is
 * for cannot build a retrieval pipeline and must be handed a tool list short by
 * construction. A binary fixes its tool set: `mcp-abap-adt-compact-ro` serves
 * the half that changes nothing.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { processEdges } from '@mcp-abap-adt/lib/config';
import { compactToolSetOf, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import {
  main as coreMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/server-runtime/stdio';

/** The compact tool set: both halves, the debugger, the leftover sessions and background runs. */
export const compactToolSet: ToolSet = compactToolSetOf({
  readOnly: compactReadOnlyEntries,
  modify: compactModifyEntries,
});

/**
 * THIS package's version, for `--version` and `initialize` — never core's: a
 * version that belongs to a different package reads as the truth (13.0.0
 * shipped that defect in the other direction). `require`, not a file read: a
 * bundler (the portable build) inlines it.
 */
export const COMPACT_VERSION: string = (
  require('../package.json') as { version: string }
).version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const COMPACT_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  return coreMain(
    {
      toolSet: compactToolSet,
      program: 'mcp-abap-adt-compact',
      version: COMPACT_VERSION,
      packageName: COMPACT_PACKAGE,
    },
    edges,
  );
}
