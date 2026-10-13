/**
 * `@mcp-abap-adt/lib/tool-set` — what a server serves, as an input of its
 * launcher (spec §3.4, §3.5, D37, D49).
 *
 * core's, http's and sse's `main({ toolSet, program, version })` take a
 * `ToolSet` and nothing else of the tools: everything a launcher does —
 * options, credentials, cancellation, failures, shutdown — is its transport's,
 * the same for any set.
 *
 * **The binary fixes the tool set** (C23, the owner's decision). There are
 * four sets, one per kind of binary, each served on stdio, Streamable HTTP
 * and SSE:
 *
 * | Set | Binaries | Tools |
 * |---|---|---|
 * | {@link fullToolSet} | `mcp-abap-adt`, `-http`, `-sse` | readonly (with system and search), high, debug, the leftover sessions (list, resume, logoff), background runs |
 * | {@link fullReadOnlyToolSet} | `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro` | readonly (with system and search), the leftover-session list and logoff |
 * | `compactToolSetOf` | `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse` | the compact readonly and modify halves, the compact debugger, the leftover sessions, background runs |
 * | `compactReadOnlyToolSetOf` | `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro` | the compact readonly half, the leftover-session list and logoff |
 *
 * No `-ro` set serves the debugger, a background run or the resume. There is
 * no `--exposition`: each set refuses it (and its YAML key) as a removed
 * parameter, naming the binary its words asked for.
 */

import { CompactBackgroundRunHandlersGroup } from './compact/backgroundRuns/group';
import { CompactDebugHandlersGroup } from './compact/debug/group';
import {
  type CompactEntryBuilder,
  CompactHandlersGroup,
} from './compact/group';
import { CompactLeftoverSessionHandlersGroup } from './compact/session/group';
import type { RemovedParameter } from './config/authParameters';
import {
  BINARIES,
  expositionRemoved,
  type ServedTransport,
  type ToolSetKind,
} from './config/binaries';
import { LeftoverSessionHandlersGroup } from './handlers/groups/LeftoverSessionHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './handlers/groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './handlers/groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './handlers/groups/SystemHandlersGroup.js';
import { ReadVsGetDedupStrategy } from './handlers/groups/strategies/index.js';
import type { HandlerContext, IHandlerGroup } from './handlers/interfaces';
import { CompositeHandlersRegistry } from './handlers/registry/CompositeHandlersRegistry';
import {
  expositionGroups,
  noConnectionContext,
} from './handlers/registry/expositionRegistry';

export {
  BINARIES,
  type Binary,
  expositionGoneWords,
  LOW_SET_GONE,
  type ServedTransport,
  type ToolSetKind,
} from './config/binaries';

/** The tools a binary serves: fixed by the binary, never by a flag. */
export interface ToolSet {
  /** Which of the four kinds of binary serves this set. */
  readonly kind: ToolSetKind;
  /**
   * Whether the set serves the background-run tools. The launcher hands the
   * server instance a background-run store only then; without one, a run
   * tool's `background: true` is refused (`background_runs_unavailable`).
   */
  readonly backgroundRuns: boolean;
  /** The TOOLS section of the `--help` of a binary serving `transport`. */
  toolsHelp(transport: ServedTransport): string;
  /**
   * The removed `--exposition` (and YAML `exposition`) of a binary serving
   * `transport`: any value stops the start, naming the binary to use instead.
   */
  expositionRemoved(transport: ServedTransport): RemovedParameter;
  /** The groups, built against `context`, in registration order. */
  groups(context: HandlerContext): IHandlerGroup[];
}

/** The registry a launcher serves: `toolSet`'s groups against a context with no connection yet. */
export function registryOf(toolSet: ToolSet): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry(toolSet.groups(noConnectionContext()));
}

/** `npm i -g <pkg>`, then `<bin>`: how a help names another binary. */
const install = (transport: ServedTransport, kind: ToolSetKind): string => {
  const { bin, pkg } = BINARIES[transport][kind];
  return `npm i -g ${pkg}, then ${bin}`;
};

/** The TOOLS section: what this binary serves, and where the rest is. */
function toolsSection(
  transport: ServedTransport,
  kind: ToolSetKind,
  served: readonly string[],
  elsewhere: ReadonlyArray<readonly [string, ToolSetKind]>,
): string {
  const { bin } = BINARIES[transport][kind];
  return `
TOOLS:
  ${bin} serves one fixed tool set; the binary chooses it, not a flag
  (--exposition is gone in 19.0.0, and passing it stops the start):
${served.map((line) => `    - ${line}`).join('\n')}

${elsewhere.map(([what, other]) => `  ${what}: ${install(transport, other)}`).join('\n')}

  For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
}

const READONLY_LINE =
  'readonly: Get*, Read*, List* (read operations), with search and system';
const DEBUG_LINE =
  'debug: the debugger tools; a breakpoint or a listener catches every request of the connected SAP user';

/**
 * The object-oriented tool set of `mcp-abap-adt`, `mcp-abap-adt-http` and
 * `mcp-abap-adt-sse`: readonly (with system and search), high, debug, the
 * leftover sessions (list, resume, logoff) and the background runs.
 */
export const fullToolSet: ToolSet = {
  kind: 'core',
  backgroundRuns: true,
  toolsHelp: (transport) =>
    toolsSection(
      transport,
      'core',
      [
        READONLY_LINE,
        'high: Create*, Update*, Delete*, Activate* (each a whole workflow via ADT)',
        DEBUG_LINE,
        'the leftover SAP sessions of an ended process: list, resume, log off',
        'background runs of RuntimeRunClass and RuntimeRunProgram: read, list, discard',
      ],
      [
        ['The readonly tools alone', 'core-ro'],
        [
          'The compact tools (one per operation; the low set is gone)',
          'compact',
        ],
      ],
    ),
  expositionRemoved: (transport) => expositionRemoved('core', transport),
  // The writing groups first, so their names feed the readonly dedup; the
  // background-run tools beside the run tools; every leftover-session tool.
  groups: (context) => expositionGroups(['readonly', 'high', 'debug'], context),
};

/**
 * The read-only object-oriented tool set of `mcp-abap-adt-ro`,
 * `mcp-abap-adt-http-ro` and `mcp-abap-adt-sse-ro`: readonly (with system and
 * search), and the leftover-session list and logoff. No high, no debugger, no
 * background run, no resume.
 */
export const fullReadOnlyToolSet: ToolSet = {
  kind: 'core-ro',
  backgroundRuns: false,
  toolsHelp: (transport) =>
    toolsSection(
      transport,
      'core-ro',
      [
        READONLY_LINE,
        'the leftover SAP sessions of an ended process: list, log off',
      ],
      [
        ['The write, debugger and background-run tools', 'core'],
        ['The compact tools that change nothing', 'compact-ro'],
      ],
    ),
  expositionRemoved: (transport) => expositionRemoved('core', transport),
  groups: (context) => [
    new ReadOnlyHandlersGroup(
      context,
      new Set<string>(),
      new ReadVsGetDedupStrategy(),
    ),
    // The run tools stay (running code changes no code, as in SAP), without
    // `background`: this set keeps no background run.
    new SystemHandlersGroup(context, { background: false }),
    new SearchHandlersGroup(context),
    new LeftoverSessionHandlersGroup(context, { resume: false }),
  ],
};

/** The two halves of the compact facade, as their packages build them. */
export interface CompactHalves {
  /** `compactReadOnlyEntries` of `@mcp-abap-adt/compact-readonly-entries`. */
  readonly readOnly: CompactEntryBuilder;
  /** `compactModifyEntries` of `@mcp-abap-adt/compact-modify`. */
  readonly modify: CompactEntryBuilder;
}

/**
 * The compact tool set of `mcp-abap-adt-compact`, `-compact-http` and
 * `-compact-sse`, composed of the two halves' entry builders: both halves in
 * one group, the four debugger verbs, the background-run tools beside the
 * run tool and every leftover-session tool — and no search, so the list is
 * short by construction.
 *
 * Every group is a real `BaseHandlerGroup`, never an object literal wrapping
 * the entries: the launcher sets the per-request context on the group that
 * owns an entry, and only a group reads `this.context` when the handler runs.
 * A literal closing over the startup context is the defect review caught on
 * PR #240 — a server running every call against the connection it had before
 * it connected.
 */
export function compactToolSetOf(halves: CompactHalves): ToolSet {
  return {
    kind: 'compact',
    backgroundRuns: true,
    toolsHelp: (transport) =>
      toolsSection(
        transport,
        'compact',
        [
          'the compact tools, one per operation with the object in object_type: HandlerGet, HandlerCreate, HandlerUpdate, HandlerDelete, HandlerActivate, HandlerLock, ...',
          'the compact debugger: HandlerDebugStart, ...Wait, ...View, ...Step; they catch every request of the connected SAP user',
          'the leftover SAP sessions of an ended process: list, resume, log off',
          'background runs of HandlerProfileRun: read, list, discard',
        ],
        [
          ['The compact tools that change nothing', 'compact-ro'],
          ['The object-oriented tools (readonly, high, debug)', 'core'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context) => [
      new CompactHandlersGroup(context, [halves.readOnly, halves.modify]),
      new CompactDebugHandlersGroup(context),
      // Beside the run tool (HandlerProfileRun): its background runs, read,
      // listed and discarded.
      new CompactBackgroundRunHandlersGroup(context),
      new CompactLeftoverSessionHandlersGroup(context, { resume: true }),
    ],
  };
}

/**
 * The read-only compact tool set of `mcp-abap-adt-compact-ro`,
 * `-compact-http-ro` and `-compact-sse-ro`: the half that changes nothing
 * (`compactReadOnlyEntries` of `@mcp-abap-adt/compact-readonly-entries`), and
 * the leftover-session list and logoff. No modify half, no debugger, no
 * background run, no resume.
 */
export function compactReadOnlyToolSetOf(
  readOnly: CompactEntryBuilder,
): ToolSet {
  return {
    kind: 'compact-ro',
    backgroundRuns: false,
    toolsHelp: (transport) =>
      toolsSection(
        transport,
        'compact-ro',
        [
          'the compact tools that change nothing, one per operation with the object in object_type: HandlerGet, HandlerSearch, HandlerWhereUsed, ...; no create, update, delete, activate, lock, unlock, unit-test run or profiler run',
          'the leftover SAP sessions of an ended process: list, log off',
        ],
        [
          ['All compact tools, the debugger and background runs', 'compact'],
          ['The object-oriented readonly tools', 'core-ro'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context) => [
      new CompactHandlersGroup(context, [readOnly], 'CompactReadOnlyHandlers'),
      new CompactLeftoverSessionHandlersGroup(context, { resume: false }),
    ],
  };
}

export type { CompactEntryBuilder } from './compact/group';
