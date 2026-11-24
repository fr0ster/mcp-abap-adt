/**
 * The descriptions of the sessions, the background runs, the transports and
 * the abapGit writes (plan step 10.6, group 8): a long session opened or
 * closed, a leftover SAP session listed or logged off, a background run
 * read, listed or ended, a transport created or its objects changed, an
 * abapGit repository linked, pulled, pushed or switched. Each fact comes
 * from the answer type the tool builds, every member by its domain noun.
 */

import type { transportAddition } from '../../handlers/transport/high/handleAddTransportObject';
import type { createdTransportNumbers } from '../../handlers/transport/high/handleCreateTransport';
import type { createdTaskNumbers } from '../../handlers/transport/high/handleCreateTransportTask';
import type { transportMove } from '../../handlers/transport/high/handleMoveTransportObjects';
import type { transportRemoval } from '../../handlers/transport/high/handleRemoveTransportObject';
import type { transportSort } from '../../handlers/transport/high/handleSortAndCompressTransportTask';
import type { ObjectsAnswerFacts, statusFacts } from '../abapGit/formats';
import type { backgroundRunList } from '../backgroundRuns/answers';
import type { BackgroundRunRecord } from '../backgroundRuns/contract';
import type { BackgroundRunTools } from '../backgroundRuns/port';
import type { leftoverListAnswer } from '../leftoverSessions/answers';
import type { LogoffOutcome } from '../leftoverSessions/port';
import type { closedSession, openedSession } from '../longSession/tools';
import { listOf, resultShape } from './returns';

/** What a long session's open answers. */
export const SESSION_OPENED = resultShape<ReturnType<typeof openedSession>>({
  state_handle: 'the state handle every call of the session carries',
});

/** What a long session's close answers. */
export const SESSION_CLOSED = resultShape<ReturnType<typeof closedSession>>({
  closed: 'whether the session is closed',
  held: 'the locks, recorded calls and debug session it held',
});

/** What the list of leftover sessions answers. */
export const LEFTOVER_SESSIONS = resultShape<
  ReturnType<typeof leftoverListAnswer>
>({
  sessions: listOf('for each leftover session', {
    handle: 'its handle',
    role: 'whether it served an instance or a debug session',
    destination: 'its destination',
    user: 'its SAP user',
    written_at: 'when it was last recorded',
  }),
});

/** What a leftover session's logoff answers. */
export const LEFTOVER_LOGGED_OFF = resultShape<LogoffOutcome>({
  handle: "the session's handle",
  state: 'that it is logged off',
});

/** A background run's own facts, as listed and as read. */
const RUN_NOUNS = {
  run_handle: 'its run handle',
  state: 'whether it is running, finished or cancelled',
  tool: 'the tool it runs',
  object: 'the object it runs',
  started_at: 'when it started',
  finished_at: 'when it ended',
} as const;

/** What a background run's read answers. */
export const BACKGROUND_RUN = resultShape<BackgroundRunRecord>({
  ...RUN_NOUNS,
  answer: 'what its tool answered once the run ended',
});

/** What the list of background runs answers. */
export const BACKGROUND_RUNS = resultShape<
  ReturnType<typeof backgroundRunList>
>({
  runs: listOf('for each run', RUN_NOUNS),
});

/** What a background run's discard answers. */
export const BACKGROUND_RUN_ENDED = resultShape<
  Awaited<ReturnType<BackgroundRunTools['discard']>>
>({
  run_handle: 'its run handle',
  state: 'whether it was cancelled or its answer deleted',
});

const ACCEPTED = 'whether SAP took the change';
const TASK = 'the transport task';
const CONFIRM = 'where the change is confirmed';

/** What an object added to a transport task answers. */
export const TRANSPORT_ADDITION = resultShape<
  ReturnType<typeof transportAddition>
>({
  accepted: ACCEPTED,
  added: "that SAP's answer leaves the attachment unconfirmed",
  transport_number: TASK,
  object: 'the object named',
  confirm_with: CONFIRM,
});

/** What an object removed from a transport task answers. */
export const TRANSPORT_REMOVAL = resultShape<
  ReturnType<typeof transportRemoval>
>({
  accepted: ACCEPTED,
  removed: "that SAP's answer leaves the removal unconfirmed",
  transport_number: TASK,
  object: 'the object named',
  position: 'its position in the task',
  confirm_with: CONFIRM,
});

/** What objects moved between transport tasks answer. */
export const TRANSPORT_MOVE = resultShape<ReturnType<typeof transportMove>>({
  accepted: ACCEPTED,
  transport_number: 'the task they leave',
  target_number: 'the task they move to',
  objects: listOf('for each object sent', {
    object: 'the object named',
    position: 'its position in the task it leaves',
  }),
  confirm_with: CONFIRM,
});

/** What a sorted and compressed transport task answers. */
export const TRANSPORT_SORTED = resultShape<ReturnType<typeof transportSort>>({
  accepted: ACCEPTED,
  transport_number: TASK,
  confirm_with: CONFIRM,
});

/** What a created transport answers. */
export const TRANSPORT_CREATED = resultShape<
  ReturnType<typeof createdTransportNumbers>
>({
  transport_number: 'the number of the transport created',
  task_number: 'the number of its task',
  task_type_error: "SAP's refusal of the task type",
  note: 'what is left to do when the task stays untyped',
});

/** What a created transport task answers. */
export const TASK_CREATED = resultShape<ReturnType<typeof createdTaskNumbers>>({
  task_number: 'the number of the task created',
  task_type: 'its type',
  task_type_error: "SAP's refusal of the task type",
  note: 'what is left to do when the task stays untyped',
});

const STATUS = "SAP's status";
const RESULT = 'whether SAP made the change or accepted it as its own job';

/** What an abapGit write answers that SAP answers with its status alone. */
export const ABAPGIT_STATUS = resultShape<ReturnType<typeof statusFacts>>({
  status: STATUS,
  result: RESULT,
});

/** What an abapGit link or pull answers: its status, and each object SAP lists. */
export const ABAPGIT_OBJECTS = resultShape<ObjectsAnswerFacts>({
  status: STATUS,
  result: RESULT,
  objects: listOf('for each object SAP lists', {
    type: 'its type',
    name: 'its name',
    package: 'its package',
    status: 'its status',
    messageType: "the severity of SAP's message for it",
  }),
});
