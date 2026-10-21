/**
 * `mcp-abap-adt-http-ro` — the read-only tool set over Streamable HTTP.
 *
 * The runtime's Streamable HTTP `main` with `fullReadOnlyToolSet`, and this command's name and
 * version. Nothing else: http's table, credentials, cancellation, failures and
 * shutdown. The launcher is `@mcp-abap-adt/server-runtime/http`'s; the
 * package depends on lib, the runtime,
 * background-runs-memory, responsible-rules, never on another binary package.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The high,
 * debugger, background-run and resume tools are `mcp-abap-adt-http`'s.
 */
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { fullReadOnlyToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as httpMain } from '@mcp-abap-adt/server-runtime/http';

/**
 * The read-only tool set: readonly (with system and search). No high, no debugger, no background run,
 * no resume.
 */
export const readOnlyToolSet: ToolSet = fullReadOnlyToolSet;

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const HTTP_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const HTTP_RO_PACKAGE: string = (
  require('../package.json') as { name: string }
).name;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof httpMain> {
  return httpMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-http-ro',
      version: HTTP_RO_VERSION,
      packageName: HTTP_RO_PACKAGE,
    },
    edges,
  );
}
