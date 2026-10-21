/**
 * `mcp-abap-adt-compact-http` — the compact tool set over Streamable HTTP.
 *
 * The runtime's Streamable HTTP `main` with `compactToolSet` — the two halves' entry
 * builders composed by lib's `compactToolSetOf` — and this command's name and
 * version. Nothing else: http's table, and
 * http's credentials, cancellation, failures and shutdown. The launcher is
 * `@mcp-abap-adt/server-runtime/http`'s; the package depends on lib, the
 * runtime and the two halves, never on another binary package.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { compactToolSetOf, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as httpMain } from '@mcp-abap-adt/server-runtime/http';

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

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const COMPACT_HTTP_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof httpMain> {
  return httpMain(
    {
      toolSet: compactToolSet,
      program: 'mcp-abap-adt-compact-http',
      version: COMPACT_HTTP_VERSION,
      packageName: COMPACT_HTTP_PACKAGE,
    },
    edges,
  );
}
