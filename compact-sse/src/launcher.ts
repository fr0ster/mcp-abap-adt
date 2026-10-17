/**
 * `mcp-abap-adt-compact-sse` — the compact tool set over HTTP+SSE.
 *
 * `@mcp-abap-adt/sse`'s `main` with `compactToolSet` — the two halves' entry
 * builders composed by lib's `compactToolSetOf` — and this command's name and
 * version. Nothing else: sse's table, and
 * sse's credentials, cancellation, failures and shutdown. It depends on lib,
 * sse and the two halves only: never on core, so neither the auth broker nor
 * the stores are installed with it.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { compactToolSetOf, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as sseMain } from '@mcp-abap-adt/sse/launcher';

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

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof sseMain> {
  return sseMain(
    {
      toolSet: compactToolSet,
      program: 'mcp-abap-adt-compact-sse',
      version: COMPACT_SSE_VERSION,
    },
    edges,
  );
}
