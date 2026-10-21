/**
 * `mcp-abap-adt-sse-ro` — the read-only tool set over HTTP+SSE.
 *
 * sse's `main` with `fullReadOnlyToolSet`, and this command's name and version.
 * Nothing else: sse's table, credentials, cancellation, failures and shutdown.
 * The launcher is `@mcp-abap-adt/server-runtime/sse`'s; the package depends on
 * lib and the runtime, never on another binary package.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The high,
 * debugger, background-run and resume tools are `mcp-abap-adt-sse`'s.
 */
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { fullReadOnlyToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as sseMain } from '@mcp-abap-adt/server-runtime/sse';

/**
 * The read-only tool set: readonly (with system and search). No high, no debugger, no background run,
 * no resume.
 */
export const readOnlyToolSet: ToolSet = fullReadOnlyToolSet;

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const SSE_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const SSE_RO_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof sseMain> {
  return sseMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-sse-ro',
      version: SSE_RO_VERSION,
      packageName: SSE_RO_PACKAGE,
    },
    edges,
  );
}
