/**
 * The descriptions of the sessions, the background runs, the transports and
 * the abapGit writes (plan step 10.6, group 8): a long session opened or
 * closed, a leftover SAP session listed or logged off, a background run
 * read, listed or ended, a transport created or its objects changed, an
 * abapGit repository linked, pulled, pushed or switched. Each fact comes
 * from the answer type the tool builds, every member by its domain noun.
 */

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
