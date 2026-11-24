/**
 * The descriptions of the debugger tools (plan step 10.6, group 9): each
 * tool does one debugger action — its purpose is that action — and its
 * facts come from the debugger's answer types, every member by its domain
 * noun, so a member added to an answer and not named here does not compile.
 * A tool whose answer is SAP's document as it came states the fixed fact of
 * plan 10.6 (`untypedReturns`).
 */

import type { AnswerEntry } from '../batch/answers';
import type { BatchSummary } from '../batch/execute';
import type { BatchAnswer } from '../batch/InstanceBatch';
import type { DebugBatchBegun } from '../batch/tools';
import type { AmdpSession } from '../debugger/AmdpSession';
import type { StartedExtra } from '../debugger/access';
import type {
  amdpStepped,
  stoppedSession,
  terseAmdpState,
  terseDebugState,
} from '../debugger/answer';
import type { BreakpointsAnswer } from '../debugger/DebugSession';
import type { DebugFailure } from '../debugger/failures';
import type {
  terseMemorySizes,
  terseSnapshotList,
} from '../debugger/memoryReadings';
import type {
  BreakpointReading,
  PlaceReading,
  terseChildVariables,
  terseSettings,
  terseStop,
  terseVariables,
} from '../debugger/readings';
import { listOf, resultShape } from './returns';

/** An answer that is a list at its top, as one member: its items, each by its nouns. */
export type Each<T extends readonly unknown[]> = { readonly each: T };

/** A text block of a recorded call's answer: what the debugger tools answer. */
type TextBlock = Extract<BatchAnswer['content'][number], { type: 'text' }>;

/**
 * A union of item types as one: every member of any variant, optional —
 * so a list whose items vary is stated by one set of nouns, a member added
 * to any variant still refused until it is named.
 */
type Merged<U> = {
  [K in U extends unknown ? keyof U : never]?: U extends {
    readonly [P in K]?: infer V;
  }
    ? V
    : never;
};

/** A breakpoint whose condition SAP could not evaluate, as a stop states it. */
type Unresolvable = NonNullable<
  ReturnType<typeof terseStop>['unresolvable_conditions']
>[number];

/** An answer without the members a start adds (the breakpoints placed). */
type Unstarted<T> = T extends unknown ? Omit<T, 'breakpoints'> : never;

/** A frame of a stop, as a stop's and a stack's answer name it. */
const FRAME_NOUNS = {
  address: 'its ADT object address',
  unit: 'its processing unit',
  program: 'its program',
  include: 'its include',
  include_line: 'its position in the include',
} as const;

/** What a stop tells, after its own facts. */
const STOP_NOUNS = {
  at: 'where the debuggee stopped',
  stack_depth: 'the depth of a stack cut to its top frames',
  attach_impossible: 'whether SAP refuses to attach the catch',
  dump: 'the short dump of a post-mortem catch',
  kind: 'the kind of a catch other than a debuggee',
  is_post_mortem: 'whether the catch is post-mortem',
  is_non_exclusive: 'whether the debuggee runs non-exclusive',
  is_debuggee_changed: 'whether the step reached another debuggee',
} as const;

const FRAMES = listOf<PlaceReading>('for each frame from the top', FRAME_NOUNS);
const UNRESOLVABLE = listOf<Unresolvable>(
  'for each breakpoint whose condition SAP failed to evaluate',
  {
    id: 'its id',
    condition: 'its condition',
    error_offset: 'where in the condition SAP failed',
  },
);

/** What a stop answers: where it stands, and the frames from the top. */
export const STOP = resultShape<ReturnType<typeof terseStop>>({
  ...STOP_NOUNS,
  frames: FRAMES,
  unresolvable_conditions: UNRESOLVABLE,
});

/** The state of a debug session, as a wait, a step and a start answer it. */
const STATE_NOUNS = {
  state: 'whether the session is idle, listening, stopped or ended',
  reason: 'why it ended',
  run: 'the outcome of the run it started',
  message: "SAP's message of an end",
  failure: 'the failure of a refused attach',
  ...STOP_NOUNS,
  stack_error: 'why the stack could be read only in part',
  settings: 'the debugger settings in force',
  settings_error: 'why the settings could be applied only in part',
} as const;

/** What a wait, a step and an end of the debuggee answer. */
export const DEBUG_STATE = resultShape<
  Unstarted<ReturnType<typeof terseDebugState>>
>({
  ...STATE_NOUNS,
  frames: FRAMES,
  unresolvable_conditions: UNRESOLVABLE,
});

/** What a start answers: the state, the breakpoints placed, and the session's handle and identity. */
export const DEBUG_STARTED = resultShape<
  ReturnType<typeof terseDebugState> & StartedExtra
>({
  ...STATE_NOUNS,
  frames: FRAMES,
  unresolvable_conditions: UNRESOLVABLE,
  breakpoints: 'the breakpoints placed and refused',
  state_handle: "the session's state handle",
  terminal_id: 'the terminal id its runs carry',
  ide_id: 'the IDE id its runs carry',
  debugging_mode: 'its debugging mode',
  request_user: 'the user whose runs it catches',
});

/** A variable's nouns. */
const VARIABLE_NOUNS = {
  id: 'its id, the parent id of its members',
  name: 'its name',
  type: 'its declared type',
  value: 'its value',
  rows: 'the size of a table variable',
} as const;

/** What a read or a change of variables answers. */
export const VARIABLES = resultShape<Each<ReturnType<typeof terseVariables>>>({
  each: listOf('for each variable', VARIABLE_NOUNS),
});

/** What a read of variables by name or as members answers. */
export const VARIABLES_OR_MEMBERS = resultShape<
  Each<Merged<ReturnType<typeof terseChildVariables>[number]>[]>
>({
  each: listOf('for each variable', {
    ...VARIABLE_NOUNS,
    label: 'the label of a member',
    parent: 'the parent of a member, when several parents are read',
  }),
});

/** A breakpoint's nouns, as SAP placed it. */
const BREAKPOINT_NOUNS = {
  id: 'its id',
  kind: 'its kind',
  uri: 'its source position',
  exceptionClass: 'its exception class',
  statement: 'its statement',
  msgId: 'its message class',
  msgNo: 'its message number',
  msgTy: 'its message type',
  condition: 'its condition',
  clientId: 'the tag it was sent with',
  error: "SAP's reason for refusing it",
} as const;

/** What the breakpoints of a session answer. */
export const BREAKPOINTS = resultShape<Each<BreakpointReading[]>>({
  each: listOf('for each breakpoint', BREAKPOINT_NOUNS),
});

/** What an addition of breakpoints answers. */
export const BREAKPOINTS_SET = resultShape<BreakpointsAnswer>({
  placed: listOf('for each breakpoint of the set placed', BREAKPOINT_NOUNS),
  refused: listOf('for each breakpoint of this call SAP refused', {
    requested: 'the breakpoint sent',
    error: "SAP's reason",
  }),
  lost: listOf('for each earlier breakpoint that dropped out of the set', {
    requested: 'the breakpoint sent',
    error: "SAP's reason",
  }),
  unexpected: listOf('for each answer SAP gave beside the breakpoints sent', {
    kind: 'its kind',
    id: 'its id',
    clientId: 'its tag',
    error: "SAP's reason",
  }),
});

/** What a removal by id answers. */
export const DELETED = resultShape<{ readonly deleted: string }>({
  deleted: 'the id deleted',
});

/** What a change of the settings answers. */
export const SETTINGS = resultShape<ReturnType<typeof terseSettings>>({
  system_debugging: 'whether system programs are debugged',
  update_debugging: 'whether update tasks are debugged',
  create_exception_object: 'whether exception objects are created',
  background_rfc: 'whether background RFC is debugged',
  shared_object_debugging: 'whether shared objects are debugged',
});

/** What a read of the memory sizes answers. */
export const MEMORY_SIZES = resultShape<ReturnType<typeof terseMemorySizes>>({
  abap_objects_used: 'the memory its ABAP objects use',
  internal_used: 'the internal memory it uses',
  internal_peak_used: 'the peak of its internal memory',
});

/** The snapshot list under terse: each snapshot, or none with what that may mean. */
type SnapshotList = ReturnType<typeof terseSnapshotList>;

/** What the list of memory snapshots answers. */
export const SNAPSHOTS = resultShape<
  Each<Extract<SnapshotList, readonly unknown[]>> &
    Pick<Exclude<SnapshotList, readonly unknown[]>, 'authorization'>
>({
  each: listOf('for each snapshot', {
    id: 'its id',
    user: 'its user',
    timestamp: 'when it was written',
    size: 'its size',
    programName: 'the program it was written in',
  }),
  authorization:
    'beside an empty set, that a user lacking the memory snapshot authorization gets one too',
});

/** What a debug session's end answers. */
export const STOPPED = resultShape<ReturnType<typeof stoppedSession>>({
  state: 'that the session stopped',
  notes: listOf<DebugFailure>('for each part that failed to undo', {
    step: 'the step it failed at',
    error: 'its error as it came',
  }),
});

/** What a recording's start answers. */
export const RECORDING = resultShape<DebugBatchBegun>({
  debug_batch: 'that recording is on',
  state_handle:
    'the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header)',
});

/** What a sending of the recorded calls answers. */
export const RECORDED_SENT = resultShape<BatchSummary>({
  recorded: 'how many calls were recorded',
  sent: 'how many were sent',
  received: "how many parts SAP's answer held",
});

/** What a read of the recorded calls' outcomes answers. */
export const RECORDED_OUTCOMES = resultShape<Each<Merged<AnswerEntry>[]>>({
  each: listOf('for each number asked', {
    number: 'the number',
    content: listOf<TextBlock>('for each block of the answer of a number', {
      type: 'its kind',
      text: 'its text',
      annotations: 'its annotations',
      _meta: 'its metadata',
    }),
    isError: 'whether it is an error',
    raw: listOf("for each part of SAP's answer a number kept", {
      status: 'its status',
      status_text: 'its status text',
      headers: 'its headers',
      body: 'its body',
    }),
    error: 'that the number is unanswered',
    message: 'why',
  }),
});

/** An AMDP breakpoint's nouns, as the system confirms it. */
const AMDP_BREAKPOINT_NOUNS = {
  class_name: 'its class',
  line: 'its source position',
  state: 'its state',
  errorMessage: "SAP's reason for an invalid one",
} as const;

/** What an AMDP session's start answers. */
export const AMDP_STARTED = resultShape<
  Awaited<ReturnType<AmdpSession['start']>> & {
    readonly state_handle: string;
  }
>({
  mainId: "the session's main id",
  breakpoints: listOf(
    'for each breakpoint the system confirmed',
    AMDP_BREAKPOINT_NOUNS,
  ),
  state_handle: "the session's state handle",
});

/** What an AMDP breakpoint change answers. */
export const AMDP_BREAKPOINTS = resultShape<{
  readonly breakpoints: Awaited<
    ReturnType<AmdpSession['setBreakpoints']>
  >['value'];
}>({
  breakpoints: listOf('for each breakpoint', AMDP_BREAKPOINT_NOUNS),
});

/** What an AMDP wait answers. */
export const AMDP_STATE = resultShape<ReturnType<typeof terseAmdpState>>({
  state: 'whether the session is idle, waiting, at an event or ended',
  reason: 'why it ended',
  run: 'the outcome of the run it started',
  events: listOf('for each event', {
    kind: 'its kind',
    requestId: 'its id',
    debuggeeId: 'the debuggee',
    line: 'its source position',
    variables: listOf('for each variable an event carries', {
      name: 'its name',
      value: 'its value',
    }),
    breakpoints: listOf(
      'for each breakpoint an event reports',
      AMDP_BREAKPOINT_NOUNS,
    ),
    stack: listOf('for each frame of an event from the top', {
      procedure: 'its database procedure',
      address: 'its ADT object address',
      native_line: 'its position in the database procedure',
      not_debug_compiled: 'that its procedure lacks debug compilation',
    }),
    stack_depth: 'the depth of a stack cut to its top frames',
  }),
});

/** What an AMDP step answers. */
export const AMDP_STEPPED = resultShape<ReturnType<typeof amdpStepped>>({
  state: 'the state after the step',
});
