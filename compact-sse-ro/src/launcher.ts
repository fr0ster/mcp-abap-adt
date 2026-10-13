/**
 * `mcp-abap-adt-compact-sse-ro` — the read-only compact tool set over HTTP+SSE
 * (C23).
 *
 * sse's `main` with `compactReadOnlyToolSetOf` over the half that changes
 * nothing, and this command's name and version. Nothing else: sse's table,
 * credentials, cancellation, failures and shutdown. It depends on lib and
 * @mcp-abap-adt/sse and the read-only half only: never on core, so neither the
 * auth broker nor the stores are installed with it.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision, C23), and a user installs only what they need. The modify
 * half, the debugger, background runs and the resume are `mcp-abap-adt-compact-sse`'s.
 */
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import {
  compactReadOnlyToolSetOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import { main as sseMain } from '@mcp-abap-adt/sse/launcher';

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
export const COMPACT_SSE_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof sseMain> {
  return sseMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-compact-sse-ro',
      version: COMPACT_SSE_RO_VERSION,
    },
    edges,
  );
}
