/**
 * `mcp-abap-adt-ro` — the read-only tool set over stdio.
 *
 * The runtime's stdio `main` (`@mcp-abap-adt/server-runtime/stdio`, the one
 * `mcp-abap-adt` runs) with `fullReadOnlyToolSet`, and this command's name and
 * version. Nothing else: core's table, credentials, cancellation, failures and
 * shutdown. The package depends on lib, the runtime,
 * background-runs-memory, responsible-rules, never on another
 * binary package.
 *
 * **Why a package of its own:** the binary fixes the tool set (the owner's
 * decision), and a user installs only what they need. The high,
 * debugger, background-run and resume tools are `mcp-abap-adt`'s.
 */
import { packageManifestOf, processEdges } from '@mcp-abap-adt/lib/config';
import { fullReadOnlyToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import {
  main as coreMain,
  type StdioLauncherEdges,
} from '@mcp-abap-adt/server-runtime/stdio';

/**
 * The read-only tool set: readonly (with system and search), and the
 * leftover-session list and logoff. No high, no debugger, no background run,
 * no resume.
 */
export const readOnlyToolSet: ToolSet = fullReadOnlyToolSet;

/**
 * THIS package's manifest, read by its shape (`packageManifestOf`). `require`,
 * not a file read: a bundler (the portable build) inlines it.
 */
const MANIFEST = packageManifestOf(require('../package.json'));

/** THIS package's version, for `--version` and `initialize`. */
export const CORE_RO_VERSION: string = MANIFEST.version;

/** THIS package's name, from the same manifest: what a second copy of lib asks to reinstall. */
export const CORE_RO_PACKAGE: string = MANIFEST.name;

export function main(
  edges: StdioLauncherEdges = processEdges(),
): Promise<void> {
  return coreMain(
    {
      toolSet: readOnlyToolSet,
      program: 'mcp-abap-adt-ro',
      version: CORE_RO_VERSION,
      packageName: CORE_RO_PACKAGE,
    },
    edges,
  );
}
