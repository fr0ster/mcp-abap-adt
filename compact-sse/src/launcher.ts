/**
 * `mcp-abap-adt-compact-sse` — the compact tool set over HTTP+SSE.
 *
 * The runtime's HTTP+SSE `main` with `compactToolSet` — the two halves' entry
 * builders composed by lib's `compactToolSetOf` — and this command's name and
 * version. Nothing else: sse's table, and
 * sse's credentials, cancellation, failures and shutdown. The launcher is
 * `@mcp-abap-adt/server-runtime/sse`'s; the package depends on lib, the runtime,
 * background-runs-memory, responsible-rules and the two halves, never on another binary package.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { compactToolSetOf, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as sseMain } from '@mcp-abap-adt/server-runtime/sse';

/** The compact tool set: both halves, the debugger and background runs. */
export const compactToolSet: ToolSet = compactToolSetOf({
  readOnly: compactReadOnlyEntries,
  modify: compactModifyEntries,
});

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const COMPACT_SSE_VERSION: string = (
  require('../package.json') as { version: string }
).version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const COMPACT_SSE_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof sseMain> {
  return sseMain(
    {
      toolSet: compactToolSet,
      program: 'mcp-abap-adt-compact-sse',
      version: COMPACT_SSE_VERSION,
      packageName: COMPACT_SSE_PACKAGE,
    },
    edges,
  );
}
