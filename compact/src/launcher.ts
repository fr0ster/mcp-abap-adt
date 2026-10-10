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
 * facade are a real choice for whoever starts the server: `rw` serves all 25 tools,
 * `ro` serves the 16 that change nothing — no create, update, delete, activate,
 * lock, unlock, unit-test run or profiler run anywhere in the list. Locally the
 * default gives every access (`rw`); `ro` is there for a host that means to hand out
 * a surface which cannot change the system. The vocabulary is deliberately NOT
 * `readonly/high/low`: those are sets of the object-oriented surface, which this
 * command does not serve.
 */
import { CompactReadOnlyHandlersGroup } from '@mcp-abap-adt/compact-readonly';
import { CompactDebugHandlersGroup } from './debug/group';
import { CompactHandlersGroup } from './group';

/** What `--exposition` means here. `rw` is the default: locally, every access. */
export type CompactExposition = 'ro' | 'rw';

const HELP_EXPOSITION = `
HANDLER EXPOSITION:
  --exposition=<set>               Which half of the compact facade to serve
                                   Options: ro, rw, debug — a comma list
                                   Default: rw

                                   - rw: all 25 tools — HandlerGet, HandlerCreate,
                                         HandlerUpdate, HandlerDelete,
                                         HandlerActivate, HandlerLock, ...
                                   - ro: the 16 that change nothing. No create,
                                         update, delete, activate, lock, unlock,
                                         unit-test run or profiler run is in the
                                         list at all, so a client cannot call one.
                                   - debug: beside ro or rw, the four debugger
                                         verbs (HandlerDebugStart, ...Wait,
                                         ...View, ...Step). They catch every
                                         request of the connected SAP user.

                                   The object-oriented sets (readonly, high, low)
                                   belong to \`mcp-abap-adt\`; this command serves the
                                   compact facade only, where the OPERATION is the
                                   tool and the object goes in \`object_type\`.
`;

/**
 * The comma list a `--exposition` flag carries, in both spellings; the last flag
 * wins. `undefined` when the flag is absent.
 *
 * **The default belongs to an ABSENT flag, never to an empty value.** The first
 * version treated the two alike, so `--exposition="$MODE"` with an unset variable
 * opened all 25 tools — writes included — and `--exposition=ro --exposition=`
 * overrode a deliberate `ro` the same way (found in review on PR #247). A flag that
 * is present but says nothing is a caller who meant something and lost it in a
 * shell; the only safe answer is to refuse.
 */
function expositionValues(argv: readonly string[]): string[] | undefined {
  let seen = false;
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--exposition') {
      seen = true;
      const next = argv[index + 1];
      // `--exposition --transport=stdio` gives the flag no value of its own.
      value = next !== undefined && !next.startsWith('-') ? next : undefined;
    } else if (arg.startsWith('--exposition=')) {
      seen = true;
      value = arg.slice('--exposition='.length);
    }
  }
  if (!seen) return undefined;
  const wanted = (value ?? '').trim().toLowerCase();
  if (wanted === '') {
    throw new Error(
      "--exposition was given no value. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 25), and 'debug' beside either. An empty value is refused rather than defaulted: an unset shell variable must not silently open the write tools.",
    );
  }
  return wanted.split(',').map((v) => v.trim());
}

/**
 * Which half of the facade: the last of `ro`/`rw` in the list, `rw` when none.
 * A value outside `ro`, `rw`, `debug` is refused by name rather than defaulted,
 * because starting with a different tool list than the one that was asked for is
 * the failure this is meant to prevent.
 */
export function parseCompactExposition(
  argv: readonly string[],
): CompactExposition {
  const values = expositionValues(argv);
  if (!values) return 'rw';
  let base: CompactExposition | undefined;
  for (const v of values) {
    if (v === 'ro' || v === 'rw') base = v;
    else if (v !== 'debug') {
      throw new Error(
        `--exposition=${v} is not a compact set. This command takes 'ro' (the 16 tools that change nothing) or 'rw' (all 25, the default), and 'debug' beside either. The sets readonly/high/low belong to \`mcp-abap-adt\`.`,
      );
    }
  }
  return base ?? 'rw';
}

/** Whether the four debugger verbs are served: `debug` in the `--exposition` list. */
export function parseCompactDebug(argv: readonly string[]): boolean {
  return expositionValues(argv)?.includes('debug') ?? false;
}

export async function main(): Promise<void> {
  // `--version` answers THIS package's version, not core's. The launcher core owns
  // would print its own manifest, which is the defect 13.0.0 shipped in the other
  // direction: a version that belongs to a different package reads as the truth.
  const manifest = require('../package.json') as { version: string };
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(manifest.version);
    return;
  }

  const exposition = parseCompactExposition(process.argv.slice(2));

  const { main: launch } = require('@mcp-abap-adt/core/launcher') as {
    main: (options: {
      program?: string;
      helpExposition?: string;
      extraGroups?: (context: never) => unknown[];
      statefulGroups?: (context: never) => unknown[];
      exposition?: readonly string[];
      includeSearch?: boolean;
      version?: string;
    }) => Promise<void>;
  };

  await launch({
    program: 'mcp-abap-adt-compact',
    version: manifest.version,
    helpExposition: HELP_EXPOSITION,
    exposition: [],
    includeSearch: false,
    // Both branches build a real group, never an object literal wrapping the
    // entries: the launcher sets the per-request context on the group that owns an
    // entry, and only a `BaseHandlerGroup` reads `this.context` when the handler
    // runs. A literal closing over the startup context is exactly the defect review
    // caught on PR #240 — a server running every call against the connection it had
    // before it connected.
    statefulGroups: (context) =>
      parseCompactDebug(process.argv.slice(2))
        ? [new CompactDebugHandlersGroup(context as never)]
        : [],
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
