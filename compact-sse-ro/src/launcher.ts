/**
 * `mcp-abap-adt-compact-sse-ro` — the read-only compact tool set over HTTP+SSE.
 *
 * The runtime's HTTP+SSE `main` with `compactReadOnlyToolSetOf` over the half that changes
 * nothing, and this command's name and version. Nothing else: sse's table,
 * credentials, cancellation, failures and shutdown. The launcher is
 * `@mcp-abap-adt/server-runtime/sse`'s; the package depends on lib, the runtime,
 * background-runs-memory, responsible-rules and the read-only half, never on another binary package.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The modify
 * half, the debugger, background runs and the resume are `mcp-abap-adt-compact-sse`'s.
 */
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import {
  type LauncherEdges,
  packageManifestOf,
  processEdges,
} from '@mcp-abap-adt/lib/config';
import {
  compactReadOnlyToolSetOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import { main as sseMain } from '@mcp-abap-adt/server-runtime/sse';

/**
 * The read-only compact tool set: the half that changes nothing. No modify half, no debugger, no
 * background run, no resume.
 */
export const readOnlyToolSet: ToolSet = compactReadOnlyToolSetOf({
  readOnly: compactReadOnlyEntries,
  data: compactDataEntries,
});

/**
 * THIS package's manifest, read by its shape (`packageManifestOf`). `require`,
 * not a file read: a bundler (the portable build) inlines it.
 */
const MANIFEST = packageManifestOf(require('../package.json'));

/** THIS package's version, for `--version` and `initialize`. */
export const COMPACT_SSE_RO_VERSION: string = MANIFEST.version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const COMPACT_SSE_RO_PACKAGE: string = MANIFEST.name;

export function main(
  edges: LauncherEdges = processEdges(),
): ReturnType<typeof sseMain> {
  return sseMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-compact-sse-ro',
      version: COMPACT_SSE_RO_VERSION,
      packageName: COMPACT_SSE_RO_PACKAGE,
    },
    edges,
  );
}
