/**
 * `mcp-abap-adt-http-ro` — the read-only tool set over Streamable HTTP (C23).
 *
 * http's `main` with `fullReadOnlyToolSet`, and this command's name and
 * version. Nothing else: http's table, credentials, cancellation, failures and
 * shutdown. It depends on lib and @mcp-abap-adt/http only: never on core, so
 * neither the auth broker nor the stores are installed with it.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision, C23), and a user installs only what they need. The high,
 * debugger, background-run and resume tools are `mcp-abap-adt-http`'s.
 */
import { main as httpMain } from '@mcp-abap-adt/http/launcher';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import { fullReadOnlyToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';

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

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof httpMain> {
  return httpMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-http-ro',
      version: HTTP_RO_VERSION,
    },
    edges,
  );
}
