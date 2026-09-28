/**
 * The compact command: the same server, a different decomposition of its tool list.
 *
 * `@mcp-abap-adt/core` owns the launcher — configuration, transports, auth, the
 * request context — and this command calls it with the compact groups instead of the
 * object-oriented ones. Nothing is copied: `main` takes `extraGroups`, an
 * `exposition`, `includeSearch`, the command's `program` name and its own
 * `helpExposition` section, which is all a second command needs.
 *
 * **Why a command at all**, rather than a flag on the first one: the host this is
 * for cannot build a retrieval pipeline and must be handed a tool list short by
 * construction. `core` refuses `--exposition=compact` now and says to install this.
 *
 * **And why this command has an exposition of its own.** The two halves of the
 * facade are a real choice for whoever starts the server: `rw` serves all 22 tools,
 * `ro` serves the 13 that change nothing — no create, update, delete, activate,
 * lock, unlock, unit-test run or profiler run anywhere in the list. Locally the
 * default gives every access (`rw`); `ro` is there for a host that means to hand out
 * a surface which cannot change the system. The vocabulary is deliberately NOT
 * `readonly/high/low`: those are sets of the object-oriented surface, which this
 * command does not serve.
 */
import { CompactReadOnlyHandlersGroup } from '@mcp-abap-adt/compact-readonly';
import { CompactHandlersGroup } from './group';

/** What `--exposition` means here. `rw` is the default: locally, every access. */
export type CompactExposition = 'ro' | 'rw';

const HELP_EXPOSITION = `
HANDLER EXPOSITION:
  --exposition=<set>               Which half of the compact facade to serve
                                   Options: ro, rw
                                   Default: rw

                                   - rw: all 22 tools — HandlerGet, HandlerCreate,
                                         HandlerUpdate, HandlerDelete,
                                         HandlerActivate, HandlerLock, ...
                                   - ro: the 13 that change nothing. No create,
                                         update, delete, activate, lock, unlock,
                                         unit-test run or profiler run is in the
                                         list at all, so a client cannot call one.

                                   The object-oriented sets (readonly, high, low)
                                   belong to \`mcp-abap-adt\`; this command serves the
                                   compact facade only, where the OPERATION is the
                                   tool and the object goes in \`object_type\`.
`;

/**
 * Read `--exposition` from argv, in both spellings.
 *
 * `--exposition=ro` and `--exposition ro`; anything else is refused by name rather
 * than falling back to a default, because starting with a different tool list than
 * the one that was asked for is the failure this is meant to prevent.
 */
export function parseCompactExposition(
  argv: readonly string[],
): CompactExposition {
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--exposition') value = argv[index + 1];
    else if (arg.startsWith('--exposition='))
      value = arg.slice('--exposition='.length);
  }
  if (value === undefined || value === '') return 'rw';
  const wanted = value.trim().toLowerCase();
  if (wanted === 'ro' || wanted === 'rw') return wanted;
  throw new Error(
    `--exposition=${value} is not a compact set. This command takes 'ro' (the 13 tools that change nothing) or 'rw' (all 22, the default). The sets readonly/high/low belong to \`mcp-abap-adt\`.`,
  );
}

export async function main(): Promise<void> {
  // `--version` answers THIS package's version, not core's. The launcher core owns
  // would print its own manifest, which is the defect 13.0.0 shipped in the other
  // direction: a version that belongs to a different package reads as the truth.
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const manifest = require('../package.json') as { version: string };
    console.log(manifest.version);
    return;
  }

  const exposition = parseCompactExposition(process.argv.slice(2));

  const { main: launch } = require('@mcp-abap-adt/core/launcher') as {
    main: (options: {
      program?: string;
      helpExposition?: string;
      extraGroups?: (context: never) => unknown[];
      exposition?: readonly string[];
      includeSearch?: boolean;
    }) => Promise<void>;
  };

  await launch({
    program: 'mcp-abap-adt-compact',
    helpExposition: HELP_EXPOSITION,
    exposition: [],
    includeSearch: false,
    // Both branches build a real group, never an object literal wrapping the
    // entries: the launcher sets the per-request context on the group that owns an
    // entry, and only a `BaseHandlerGroup` reads `this.context` when the handler
    // runs. A literal closing over the startup context is exactly the defect review
    // caught on PR #240 — a server running every call against the connection it had
    // before it connected.
    extraGroups: (context) => [
      exposition === 'ro'
        ? new CompactReadOnlyHandlersGroup(context as never)
        : new CompactHandlersGroup(context as never),
    ],
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
