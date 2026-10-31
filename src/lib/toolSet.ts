/**
 * `@mcp-abap-adt/lib/tool-set` — what a server serves, as an input of its
 * launcher.
 *
 * core's, http's and sse's `main({ toolSet, program, version })` take a
 * `ToolSet` and nothing else of the tools: everything a launcher does —
 * options, credentials, cancellation, failures, shutdown — is its transport's,
 * the same for any set.
 *
 * **The binary fixes the tool set** (the owner's decision). There are
 * four sets, one per kind of binary, each served on stdio, Streamable HTTP
 * and SSE:
 *
 * | Set | Binaries | Tools |
 * |---|---|---|
 * | {@link fullToolSet} | `mcp-abap-adt`, `-http`, `-sse` | readonly (with system and search), high, debug, background runs, batch mode, the debugger batch; on stdio the leftover-session list and logoff; on Streamable HTTP `SessionOpen`, `SessionClose` |
 * | {@link fullReadOnlyToolSet} | `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro` | readonly (with system and search), batch mode; on stdio the leftover-session list and logoff; on Streamable HTTP `SessionOpen`, `SessionClose` |
 * | `compactToolSetOf` | `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse` | the compact readonly and modify halves, the compact debugger, background runs, `HandlerBatch`, `HandlerDebugBatch`; on stdio the leftover-session list and logoff; on Streamable HTTP `HandlerSession` |
 * | `compactReadOnlyToolSetOf` | `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro` | the compact readonly half, `HandlerBatch`; on stdio the leftover-session list and logoff; on Streamable HTTP `HandlerSession` |
 *
 * **The leftover-session tools are stdio's**: the
 * runtime session files exist for stdio, where the process serves one user.
 * An http or sse server holds many sessions of different users: it writes no
 * session file, and none of its binaries lists a leftover-session tool — the
 * transport a set is served on is the one dimension beside the kind.
 *
 * **The long-session tools are Streamable HTTP's**: its instances last one
 * request each unless they hold state, and the model keeps one — with its SAP
 * connection — by opening a long session. stdio and SSE keep their instance
 * between calls, and none of their binaries lists a session tool. Every kind
 * serves it, the `-ro` ones included: it changes nothing in the system.
 *
 * No `-ro` set serves the debugger or a background run. No set serves a
 * resume of a leftover session: a stdio process is born on the one leftover
 * of its destination at its start. There is
 * no `--exposition`: each set refuses it (and its YAML key) as a removed
 * parameter, naming the binary its words asked for.
 */

import './instance.js';

import { CompactBackgroundRunHandlersGroup } from './compact/backgroundRuns/group';
import { CompactBatchHandlersGroup } from './compact/batch/group';
import {
  CompactDebugBatchHandlersGroup,
  CompactDebugHandlersGroup,
} from './compact/debug/group';
import {
  type CompactEntryBuilder,
  CompactHandlersGroup,
} from './compact/group';
import { CompactLongSessionHandlersGroup } from './compact/longSession/group';
import {
  CompactLeftoverSessionHandlersGroup,
  CompactLeftoverSessionListHandlersGroup,
} from './compact/session/group';
import type { RemovedParameter } from './config/authParameters';
import {
  BINARIES,
  expositionRemoved,
  type ServedTransport,
  type ToolSetKind,
} from './config/binaries';
import { BatchHandlersGroup } from './handlers/groups/BatchHandlersGroup.js';
import { DebugBatchHandlersGroup } from './handlers/groups/DebugBatchHandlersGroup.js';
import {
  LeftoverSessionHandlersGroup,
  LeftoverSessionListHandlersGroup,
} from './handlers/groups/LeftoverSessionHandlersGroup.js';
import { LongSessionHandlersGroup } from './handlers/groups/LongSessionHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './handlers/groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './handlers/groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './handlers/groups/SystemHandlersGroup.js';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from './handlers/interfaces';
import { CompositeHandlersRegistry } from './handlers/registry/CompositeHandlersRegistry';
import {
  expositionGroups,
  noConnectionContext,
} from './handlers/registry/expositionRegistry';
import {
  STATE_HANDLE_ARGUMENT_WORDS,
  withStateHandle,
} from './state/stateHandleArgument';

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
  /**
   * The groups of a binary serving `transport`, built against `context`, in
   * registration order: the leftover-session group on stdio only.
   */
  groups(context: HandlerContext, transport: ServedTransport): IHandlerGroup[];
}

/**
 * The registry a launcher serving `transport` serves: `toolSet`'s groups
 * against a context with no connection yet.
 */
export function registryOf(
  toolSet: ToolSet,
  transport: ServedTransport,
): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry(
    toolSet.groups(noConnectionContext(), transport),
  );
}

/** What a Streamable HTTP binary of a set serves beside its stdio binary. */
export interface StreamableHttpSurface {
  /** Which of the four kinds of binary serves the set. */
  readonly kind: ToolSetKind;
  /** The set's binaries on each transport. */
  readonly binaries: Readonly<Record<ServedTransport, string>>;
  /**
   * The tools only Streamable HTTP serves (the long session), in
   * registration order, each as the HTTP server registers it: its schema with
   * the declared `state_handle` (`withStateHandle`).
   */
  readonly sessionTools: ReadonlyArray<HandlerEntry['toolDefinition']>;
  /** The tools the stdio binary serves and the Streamable HTTP one does not. */
  readonly stdioOnly: readonly string[];
  /** The description of the `state_handle` every HTTP tool declares. */
  readonly stateHandleWords: string;
}

const namesOf = (toolSet: ToolSet, transport: ServedTransport): string[] =>
  toolSet
    .groups(noConnectionContext(), transport)
    .flatMap((group) => group.getHandlers())
    .map((entry) => entry.toolDefinition.name);

/**
 * The Streamable HTTP surface of `toolSet`, from the registration its server
 * uses: the set's groups on `http` against its groups on `stdio`, and the
 * `state_handle` declaration the server adds to every tool. What the tool
 * pages render as their Streamable HTTP section.
 */
export function streamableHttpSurface(toolSet: ToolSet): StreamableHttpSurface {
  const stdio = new Set(namesOf(toolSet, 'stdio'));
  const http = toolSet
    .groups(noConnectionContext(), 'http')
    .flatMap((group) => group.getHandlers());
  const httpNames = new Set(http.map((entry) => entry.toolDefinition.name));
  const binaryOf = (transport: ServedTransport) =>
    BINARIES[transport][toolSet.kind].bin;
  return {
    kind: toolSet.kind,
    binaries: {
      stdio: binaryOf('stdio'),
      http: binaryOf('http'),
      sse: binaryOf('sse'),
    },
    sessionTools: http
      .filter((entry) => !stdio.has(entry.toolDefinition.name))
      .map((entry) => ({
        ...entry.toolDefinition,
        inputSchema: withStateHandle(
          entry.toolDefinition.inputSchema,
        ) as HandlerEntry['toolDefinition']['inputSchema'],
      })),
    stdioOnly: [...stdio].filter((name) => !httpNames.has(name)),
    stateHandleWords: STATE_HANDLE_ARGUMENT_WORDS,
  };
}

/** The runtime session files, and so the leftover-session tools, are stdio's. */
const servesLeftoverSessions = (transport: ServedTransport): boolean =>
  transport === 'stdio';

/**
 * The long session is Streamable HTTP's: its instances last one request each
 * unless they hold state, and the model keeps one by opening a long session.
 * stdio and SSE keep their instance between calls.
 */
const servesLongSession = (transport: ServedTransport): boolean =>
  transport === 'http';

/** The help line of the long session, on Streamable HTTP only. */
const longSessionLine = (
  transport: ServedTransport,
  line: string,
): readonly string[] => (servesLongSession(transport) ? [line] : []);

/** The help line of the leftover sessions, on stdio only. */
const leftoverLine = (
  transport: ServedTransport,
  line: string,
): readonly string[] => (servesLeftoverSessions(transport) ? [line] : []);

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
  'readonly: Get*, List*, ReadTransport* (read operations), with search and system';
const BATCH_LINE =
  'batch mode: BatchBegin, BatchEnd, BatchAnswers — independent calls recorded, sent together in envelopes, answered by number';
const COMPACT_BATCH_LINE =
  "batch mode: HandlerBatch (action 'begin', 'end', 'answers') — independent calls recorded, sent together in envelopes, answered by number";
const LONG_SESSION_LINE =
  'the long session: SessionOpen, SessionClose — the server instance and its SAP connection kept for the calls that carry its state_handle, until its close logs it off';
const COMPACT_LONG_SESSION_LINE =
  "the long session: HandlerSession (action 'open', 'close') — the server instance and its SAP connection kept for the calls that carry its state_handle, until its close logs it off";
const DEBUG_LINE =
  'debug: the debugger tools; a breakpoint or a listener catches every request of the connected SAP user';
const DEBUG_BATCH_LINE =
  'the debugger batch: DebugBatchBegin, DebugBatchEnd — calls at the stopped ABAP debuggee or the AMDP break recorded, sent together in one envelope, answered by number';
const COMPACT_DEBUG_BATCH_LINE =
  "the debugger batch: HandlerDebugBatch (action 'begin', 'end', 'answers') — calls at the stopped ABAP debuggee or the AMDP break recorded, sent together in one envelope, answered by number";

/**
 * The object-oriented tool set of `mcp-abap-adt`, `mcp-abap-adt-http` and
 * `mcp-abap-adt-sse`: readonly (with system and search), high, debug and the
 * background runs; on stdio the leftover-session list and logoff.
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
        DEBUG_BATCH_LINE,
        ...leftoverLine(
          transport,
          'the leftover SAP sessions of an ended process: list, log off',
        ),
        'background runs of RuntimeRunClass and RuntimeRunProgram: read, list, discard',
        BATCH_LINE,
        ...longSessionLine(transport, LONG_SESSION_LINE),
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
  // background-run tools beside the run tools; every leftover-session tool
  // on stdio.
  groups: (context, transport) => [
    ...expositionGroups(['readonly', 'high', 'debug'], context).filter(
      (group) =>
        servesLeftoverSessions(transport) ||
        !(group instanceof LeftoverSessionHandlersGroup),
    ),
    // Batch mode, on every transport; the debugger batch beside the debugger.
    new BatchHandlersGroup(context),
    new DebugBatchHandlersGroup(context),
    // The long session, on Streamable HTTP alone.
    ...(servesLongSession(transport)
      ? [new LongSessionHandlersGroup(context)]
      : []),
  ],
};

/**
 * The read-only object-oriented tool set of `mcp-abap-adt-ro`,
 * `mcp-abap-adt-http-ro` and `mcp-abap-adt-sse-ro`: readonly (with system and
 * search); on stdio the leftover-session list. Nothing in it changes the
 * system (the owner's decision): no high, no debugger, no run of a class or
 * a program, no trace schedule, no leftover-session logoff, no background run.
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
        ...leftoverLine(
          transport,
          'the leftover SAP sessions of an ended process: list',
        ),
        BATCH_LINE,
        ...longSessionLine(transport, LONG_SESSION_LINE),
      ],
      [
        [
          'The tools that change the system (write, run, debugger, a session logoff) and background runs',
          'core',
        ],
        ['The compact tools that change nothing', 'compact-ro'],
      ],
    ),
  expositionRemoved: (transport) => expositionRemoved('core', transport),
  groups: (context, transport) => [
    new ReadOnlyHandlersGroup(context),
    new SystemHandlersGroup(context),
    new SearchHandlersGroup(context),
    ...(servesLeftoverSessions(transport)
      ? [new LeftoverSessionListHandlersGroup(context)]
      : []),
    new BatchHandlersGroup(context),
    ...(servesLongSession(transport)
      ? [new LongSessionHandlersGroup(context)]
      : []),
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
 * one group, the four debugger tools, the background-run tools beside the
 * run tool and, on stdio, every leftover-session tool — and no search, so the list is
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
          'the compact debugger, one request per call: HandlerDebugBreakpoints, ...Session, ...Step, ...Maintain; the breakpoints catch every request of the connected SAP user',
          COMPACT_DEBUG_BATCH_LINE,
          ...leftoverLine(
            transport,
            'the leftover SAP sessions of an ended process: list, log off',
          ),
          'background runs of HandlerProfileRun: read, list, discard',
          COMPACT_BATCH_LINE,
          ...longSessionLine(transport, COMPACT_LONG_SESSION_LINE),
        ],
        [
          ['The compact tools that change nothing', 'compact-ro'],
          ['The object-oriented tools (readonly, high, debug)', 'core'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context, transport) => [
      new CompactHandlersGroup(context, [halves.readOnly, halves.modify]),
      new CompactDebugHandlersGroup(context),
      new CompactDebugBatchHandlersGroup(context),
      // Beside the run tool (HandlerProfileRun): its background runs, read,
      // listed and discarded.
      new CompactBackgroundRunHandlersGroup(context),
      ...(servesLeftoverSessions(transport)
        ? [new CompactLeftoverSessionHandlersGroup(context)]
        : []),
      new CompactBatchHandlersGroup(context),
      ...(servesLongSession(transport)
        ? [new CompactLongSessionHandlersGroup(context)]
        : []),
    ],
  };
}

/**
 * The read-only compact tool set of `mcp-abap-adt-compact-ro`,
 * `-compact-http-ro` and `-compact-sse-ro`: the half that changes nothing
 * (`compactReadOnlyEntries` of `@mcp-abap-adt/compact-readonly-entries`); on
 * stdio the leftover-session list. No modify half, no debugger, no
 * leftover-session logoff, no background run.
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
          ...leftoverLine(
            transport,
            'the leftover SAP sessions of an ended process: list',
          ),
          COMPACT_BATCH_LINE,
          ...longSessionLine(transport, COMPACT_LONG_SESSION_LINE),
        ],
        [
          ['All compact tools, the debugger and background runs', 'compact'],
          ['The object-oriented readonly tools', 'core-ro'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context, transport) => [
      new CompactHandlersGroup(context, [readOnly], 'CompactReadOnlyHandlers'),
      ...(servesLeftoverSessions(transport)
        ? [new CompactLeftoverSessionListHandlersGroup(context)]
        : []),
      new CompactBatchHandlersGroup(context),
      ...(servesLongSession(transport)
        ? [new CompactLongSessionHandlersGroup(context)]
        : []),
    ],
  };
}

export type { CompactEntryBuilder } from './compact/group';
