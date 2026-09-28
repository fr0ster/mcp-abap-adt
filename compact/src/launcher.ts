/**
 * The compact command: the same server, a different decomposition of its tool list.
 *
 * `@mcp-abap-adt/core` owns the launcher — configuration, transports, auth, the
 * request context — and this command calls it with the compact groups instead of the
 * object-oriented ones. Nothing is copied: `main` takes `extraGroups`, an
 * `exposition` and `includeSearch`, which is all a second command needs.
 *
 * **Why a command at all**, rather than a flag on the first one: the host this is
 * for cannot build a retrieval pipeline and must be handed a tool list short by
 * construction. A flag can be forgotten or mistyped; a command whose default IS the
 * compact list cannot be. `core` refuses `--exposition=compact` now and says to
 * install this.
 *
 * The list is exactly the 22 compact tools: no `readonly`/`high`/`low` set, and the
 * search tools left out too, because "a tool list of a known size" is the point.
 */
import { CompactHandlersGroup } from './group';

export async function main(): Promise<void> {
  // `--version` answers THIS package's version, not core's. The launcher core owns
  // would print its own manifest, which is the defect 13.0.0 shipped in the other
  // direction: a version that belongs to a different package reads as the truth.
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const manifest = require('../package.json') as { version: string };
    console.log(manifest.version);
    return;
  }

  const { main: launch } = require('@mcp-abap-adt/core/launcher') as {
    main: (options: {
      extraGroups?: (context: never) => unknown[];
      exposition?: readonly string[];
      includeSearch?: boolean;
    }) => Promise<void>;
  };

  await launch({
    exposition: [],
    includeSearch: false,
    extraGroups: (context) => [new CompactHandlersGroup(context)],
  });
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      '[MCP] compact launcher failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
