/**
 * `mcp-abap-adt-compact-http` — the compact tool set over Streamable HTTP.
 *
 * `@mcp-abap-adt/http`'s `main` with `compactToolSet` — the two halves' entry
 * builders composed by lib's `compactToolSetOf` — and this command's name and
 * version. Nothing else: http's table, and
 * http's credentials, cancellation, failures and shutdown. It depends on lib,
 * http and the two halves only: never on core, so neither the auth broker nor
 * the stores are installed with it.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { main as httpMain } from '@mcp-abap-adt/http/launcher';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { compactToolSetOf, type ToolSet } from '@mcp-abap-adt/lib/tool-set';

/** The compact tool set: both halves, the debugger and background runs. */
export const compactToolSet: ToolSet = compactToolSetOf({
  readOnly: compactReadOnlyEntries,
  modify: compactModifyEntries,
});

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const COMPACT_HTTP_VERSION: string = (
  require('../package.json') as { version: string }
).version;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof httpMain> {
  return httpMain(
    {
      toolSet: compactToolSet,
      program: 'mcp-abap-adt-compact-http',
      version: COMPACT_HTTP_VERSION,
    },
    edges,
  );
}
