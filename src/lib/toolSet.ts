/**
 * `@mcp-abap-adt/lib/tool-set` — what a server serves, as an input of its
 * launcher.
 *
 * core's, http's and sse's `main({ toolSet, program, version })` take a
 * `ToolSet` and nothing else of the tools: everything a launcher does —
 * options, credentials, cancellation, failures, shutdown — is its transport's,
 * the same for any set.
 *
 * **The binary fixes the tool set** (the owner's decision), with one
 * exception: the data tools (`GetSqlQuery`, `GetTableContents`, compact
 * `HandlerGetData`) are served only when the binary is started with
 * `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`), off by
 * default (SAP API Policy FAQ v1.3, Q33; the customer decides), handed to
 * `groups` as {@link ServedTools}. There are four sets, one per kind of
 * binary, each served on stdio, Streamable HTTP and SSE:
 *
 * | Set | Binaries | Tools |
 * |---|---|---|
 * | {@link fullToolSet} | `mcp-abap-adt`, `-http`, `-sse` | readonly (with system and search), high, debug, background runs, batch mode, the debugger batch; on stdio the leftover-session list and logoff; on Streamable HTTP `SessionOpen`, `SessionClose` |
 * | {@link fullReadOnlyToolSet} | `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro` | readonly (with system and search), background runs of the long reads, batch mode; on stdio the leftover-session list and logoff; on Streamable HTTP `SessionOpen`, `SessionClose` |
 * | `compactToolSetOf` | `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse` | the compact readonly and modify halves, the compact debugger, background runs, `HandlerBatch`, `HandlerDebugBatch`; on stdio the leftover-session list and logoff; on Streamable HTTP `HandlerSession` |
 * | `compactReadOnlyToolSetOf` | `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro` | the compact readonly half, background runs of the long reads, `HandlerBatch`; on stdio the leftover-session list and logoff; on Streamable HTTP `HandlerSession` |
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
 * No `-ro` set serves the debugger or a run of code; each serves the
 * background runs of its long reads (the owner, D24: every long tool only
 * reads), so its runs are reads alone. No set serves a
 * resume of a leftover session: a stdio process is born on the one leftover
 * of its destination at its start. There is
 * no `--exposition`: each set refuses it (and its YAML key) as a removed
 * parameter, naming the binary its words asked for.
 */

import './instance.js';
import type { IAccessChecks } from './access/accessChecks';
import type { AccessRestrictions } from './access/accessLists';
import { COMPACT_READ_ONLY_TOOL_NAMES } from './access/compactReadOnlyTools';
import type { DeniedActions } from './access/deniedActions';
import { accessChecksFor } from './access/packageTreeAccessChecks';
import { accessStartLine } from './access/startLine';
import { unmatchedEntries, withoutDenied } from './access/withoutDenied';

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
import { BackgroundRunHandlersGroup } from './handlers/groups/BackgroundRunHandlersGroup.js';
import { BatchHandlersGroup } from './handlers/groups/BatchHandlersGroup.js';
import { DataHandlersGroup } from './handlers/groups/DataHandlersGroup.js';
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

/**
 * The tools a binary serves: fixed by the binary, but for the data tools,
 * which `--enable-data-tools` adds ({@link ServedTools}).
 */
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
   * registration order: the leftover-session group on stdio only, the data
   * tools only when `served.dataTools` is `true`.
   */
  groups(
    context: HandlerContext,
    transport: ServedTransport,
    served: ServedTools,
  ): IHandlerGroup[];
}

/**
 * What a binary's configuration adds to its set: the data tools —
 * `GetSqlQuery` and `GetTableContents`, compact `HandlerGetData` — only when
 * `dataTools` is `true` (`--enable-data-tools`, `MCP_ENABLE_DATA_TOOLS`,
 * `enable-data-tools`; off by default). Required wherever a set is built, so
 * every caller states it.
 */
export interface ServedTools {
  readonly dataTools: boolean;
}

/**
 * The registry a launcher serving `transport` serves: `toolSet`'s groups
 * against a context with no connection yet, with what `served` adds, the
 * `denied` actions applied (`withoutDenied`; none by default).
 */
export function registryOf(
  toolSet: ToolSet,
  transport: ServedTransport,
  served: ServedTools,
  denied: DeniedActions = [],
): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry(
    withoutDenied(
      toolSet.groups(noConnectionContext(), transport, served),
      denied,
    ),
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

const namesOf = (
  toolSet: ToolSet,
  transport: ServedTransport,
  served: ServedTools,
): string[] =>
  toolSet
    .groups(noConnectionContext(), transport, served)
    .flatMap((group) => group.getHandlers())
    .map((entry) => entry.toolDefinition.name);

/**
 * The Streamable HTTP surface of `toolSet`, from the registration its server
 * uses: the set's groups on `http` against its groups on `stdio`, and the
 * `state_handle` declaration the server adds to every tool. What the tool
 * pages render as their Streamable HTTP section.
 */
export function streamableHttpSurface(
  toolSet: ToolSet,
  served: ServedTools,
): StreamableHttpSurface {
  const stdio = new Set(namesOf(toolSet, 'stdio', served));
  const http = toolSet
    .groups(noConnectionContext(), 'http', served)
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
        inputSchema: withStateHandle(entry.toolDefinition.inputSchema),
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
  ${bin} serves one fixed tool set; the binary chooses it
  (--exposition is gone in 19.0.0, and passing it stops the start), and one
  flag adds the data tools:
${served.map((line) => `    - ${line}`).join('\n')}

${elsewhere.map(([what, other]) => `  ${what}: ${install(transport, other)}`).join('\n')}

  For details: docs/user-guide/HANDLERS_MANAGEMENT.md
`;
}

/**
 * The data-tools line of a set's TOOLS help: what they are and the flag that
 * serves them; the DATA TOOLS section gives the reason.
 */
const dataToolsLine = (tools: string): string =>
  `the data tools, ${tools}: off by default; served only with --enable-data-tools (see DATA TOOLS: SAP API Policy FAQ Q33)`;
const DATA_LINE = dataToolsLine('GetSqlQuery and GetTableContents');
const COMPACT_DATA_LINE = dataToolsLine('HandlerGetData');

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
        'background runs of the long reads, RuntimeRunClass and RuntimeRunProgram: read, list, cancel or discard',
        BATCH_LINE,
        DATA_LINE,
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
  groups: (context, transport, served) => [
    ...expositionGroups(
      ['readonly', 'high', 'debug', ...(served.dataTools ? ['data'] : [])],
      context,
    ).filter(
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
 * search) and the background runs of its long reads; on stdio the
 * leftover-session list. Nothing in it changes the system (the owner's
 * decision): no high, no debugger, no run of a class or a program, no trace
 * schedule, no leftover-session logoff.
 */
export const fullReadOnlyToolSet: ToolSet = {
  kind: 'core-ro',
  backgroundRuns: true,
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
        'background runs of the long reads: read, list, cancel',
        BATCH_LINE,
        DATA_LINE,
        ...longSessionLine(transport, LONG_SESSION_LINE),
      ],
      [
        [
          'The tools that change the system (write, run, debugger, a session logoff)',
          'core',
        ],
        ['The compact tools that change nothing', 'compact-ro'],
      ],
    ),
  expositionRemoved: (transport) => expositionRemoved('core', transport),
  groups: (context, transport, served) => [
    new ReadOnlyHandlersGroup(context),
    new SystemHandlersGroup(context),
    // The data tools, opt-in.
    ...(served.dataTools ? [new DataHandlersGroup(context)] : []),
    new SearchHandlersGroup(context),
    // The background runs of the long reads: read, listed and cancelled.
    new BackgroundRunHandlersGroup(context),
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
  /**
   * `compactDataEntries` of `@mcp-abap-adt/compact-readonly-entries`: the
   * data tool, served only when `served.dataTools` is `true`.
   */
  readonly data: CompactEntryBuilder;
  /** `compactModifyEntries` of `@mcp-abap-adt/compact-modify`. */
  readonly modify: CompactEntryBuilder;
}

/** The read-only half of the compact facade, as its package builds it. */
export type CompactReadOnlyHalf = Pick<CompactHalves, 'readOnly' | 'data'>;

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
          'background runs of the long reads and HandlerProfileRun: read, list, cancel or discard',
          COMPACT_BATCH_LINE,
          COMPACT_DATA_LINE,
          ...longSessionLine(transport, COMPACT_LONG_SESSION_LINE),
        ],
        [
          ['The compact tools that change nothing', 'compact-ro'],
          ['The object-oriented tools (readonly, high, debug)', 'core'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context, transport, served) => [
      new CompactHandlersGroup(context, [
        halves.readOnly,
        // The data tool, opt-in.
        ...(served.dataTools ? [halves.data] : []),
        halves.modify,
      ]),
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
 * stdio the leftover-session list; the background runs of its long reads.
 * No modify half, no debugger, no leftover-session logoff, no run of code.
 */
export function compactReadOnlyToolSetOf(half: CompactReadOnlyHalf): ToolSet {
  return {
    kind: 'compact-ro',
    backgroundRuns: true,
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
          'background runs of the long reads: read, list, cancel',
          COMPACT_BATCH_LINE,
          COMPACT_DATA_LINE,
          ...longSessionLine(transport, COMPACT_LONG_SESSION_LINE),
        ],
        [
          ['All compact tools, the debugger and the profiler run', 'compact'],
          ['The object-oriented readonly tools', 'core-ro'],
        ],
      ),
    expositionRemoved: (transport) => expositionRemoved('compact', transport),
    groups: (context, transport, served) => [
      new CompactHandlersGroup(
        context,
        // The data tool, opt-in.
        [half.readOnly, ...(served.dataTools ? [half.data] : [])],
        'CompactReadOnlyHandlers',
      ),
      // The background runs of the long reads: read, listed and cancelled.
      new CompactBackgroundRunHandlersGroup(context),
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

/**
 * The tool names the `-ro` twins serve — the core-ro set's and the
 * compact-ro set's, on every transport, the data tools included: the tools
 * whose package and request arguments are not checked (spec §3.3). The
 * compact read-only half comes from a constant (`COMPACT_READ_ONLY_TOOL_NAMES`):
 * lib does not import the package that builds it.
 */
export function readOnlyToolNames(): ReadonlySet<string> {
  const served: ServedTools = { dataTools: true };
  const names = new Set<string>(COMPACT_READ_ONLY_TOOL_NAMES);
  const compactReadOnly = compactReadOnlyToolSetOf({
    readOnly: () => [],
    data: () => [],
  });
  for (const set of [fullReadOnlyToolSet, compactReadOnly]) {
    for (const transport of ['stdio', 'http', 'sse'] as const) {
      for (const group of set.groups(
        noConnectionContext(),
        transport,
        served,
      )) {
        for (const entry of group.getHandlers()) {
          names.add(entry.toolDefinition.name);
        }
      }
    }
  }
  return names;
}

/** What a launcher serves under the restrictions its start read. */
export interface RestrictedStart {
  /** `registryOf` with the denied actions applied. */
  readonly registry: CompositeHandlersRegistry;
  /** The strategy for the call-time lists; `undefined` when none is configured. */
  readonly accessChecks: IAccessChecks | undefined;
  /** The start line (`accessStartLine`), written once per process. */
  readonly startLine: string;
}

/**
 * The registry, the strategy and the start line of a launcher serving
 * `toolSet` on `transport` under `restrictions` (none: as without them).
 */
export function restrictedStart(
  toolSet: ToolSet,
  transport: ServedTransport,
  served: ServedTools,
  restrictions: AccessRestrictions = { deniedActions: [], lists: {} },
): RestrictedStart {
  const unmatched = unmatchedEntries(
    toolSet.groups(noConnectionContext(), transport, served),
    restrictions.deniedActions,
  );
  const tree =
    restrictions.lists.allowedPackages?.some(
      (entry) => entry.kind === 'subtree',
    ) === true;
  return {
    registry: registryOf(
      toolSet,
      transport,
      served,
      restrictions.deniedActions,
    ),
    accessChecks: accessChecksFor(restrictions.lists),
    startLine: accessStartLine(restrictions, unmatched, tree),
  };
}
