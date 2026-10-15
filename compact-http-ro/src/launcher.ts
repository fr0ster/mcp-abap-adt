/**
 * `mcp-abap-adt-compact-http-ro` — the read-only compact tool set over
 * Streamable HTTP.
 *
 * http's `main` with `compactReadOnlyToolSetOf` over the half that changes
 * nothing, and this command's name and version. Nothing else: http's table,
 * credentials, cancellation, failures and shutdown. It depends on lib and
 * @mcp-abap-adt/http and the read-only half only: never on core, so neither the
 * auth broker nor the stores are installed with it.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The modify
 * half, the debugger, background runs and the resume are `mcp-abap-adt-compact-http`'s.
 */
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { main as httpMain } from '@mcp-abap-adt/http/launcher';
import { type LauncherEdges, processEdges } from '@mcp-abap-adt/lib/config';
import {
  compactReadOnlyToolSetOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';

/**
 * The read-only compact tool set: the half that changes nothing. No modify half, no debugger, no
 * background run, no resume.
 */
export const readOnlyToolSet: ToolSet = compactReadOnlyToolSetOf(
  compactReadOnlyEntries,
);

/**
 * THIS package's version, for `--version` and `initialize`. `require`, not a
 * file read: a bundler (the portable build) inlines it.
 */
export const COMPACT_HTTP_RO_VERSION: string = (
  require('../package.json') as { version: string }
).version;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof httpMain> {
  return httpMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-compact-http-ro',
      version: COMPACT_HTTP_RO_VERSION,
    },
    edges,
  );
}
