/**
 * A background run: the run tool on a connection of its own, which the call
 * that starts it does not wait for.
 *
 * - **its own connection** — opened through the fresh-connection path
 *   (`openFreshConnection`): a sibling of a connection the server
 *   built, or the host's `freshConnection`; on an injected connection
 *   without one the start is refused with its fixed words, before anything is
 *   kept. Stateless. It is the server's (role `background`), owned by the
 *   strategy, not by the instance whose call started it: the instance's
 *   terminal close (`closeOwnedConnections` — the pool's eviction, the idle
 *   bound) does not cut it;
 * - **cut by its instance's close, as by the process's end** — the run is
 *   registered in the registry of live tools (`activeTools`) under the
 *   instance whose call started it, and its connection is handed to that
 *   instance's tracking (`track`) as soon as it exists, before its
 *   `connect()` (an instance closed while the host's factory ran refuses it
 *   there, nothing sent): the instance close
 *   (`closeInstance` — an SSE stream that closed, stdio's transport, an
 *   embedder's session-ending transport) logs it off at once with the
 *   instance's own, in the same tick, which cuts it. A run of another
 *   instance is untouched. An HTTP instance is never closed that way (its
 *   transport close ends no session): its runs go on — neither a dropped
 *   request nor the pool's eviction cuts them. The process's end (stdio's client close, a signal) logs every
 *   run's connection off at once (`logOffAtOnce`), and the forced close
 *   names it among what was still running. A cut run ends in the store the
 *   same way either way: by its own end below, once its request settled —
 *   with the run tool's answer (an error when its session was gone first);
 *   nothing else is written for it;
 * - **its end** — once SAP answered: the connection is logged off
 *   (`disconnect()`), then the answer is handed to the strategy (`finish`),
 *   then the run leaves the registry. An answer is what the run tool would
 *   have answered, an error included;
 * - **a read's cancel** (`BackgroundRunControl.cancel`, the owner's on
 *   `DiscardBackgroundRun`) — the run is marked cancelled first, then its
 *   connection logged off (SAP ends the read), then the cancelled answer
 *   handed to the strategy (`finish`). `cancelled` is final: the run's own
 *   end that comes later — the read's rejection or a late answer — calls no
 *   `finish`. `finish` is called exactly once per run, whichever comes
 *   first: a cancel that comes while the end is being kept waits for it and
 *   answers `finished`.
 *
 * One connection per run: the run tool works on it directly (a listed long
 * tool's read included — never through `runLongCall`, which would open a
 * second). No timer: the run ends when SAP answers, or when it is cancelled.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { registerActiveTool } from '../activeTools';
import { backgroundRunLimitWords, ServerRefusal } from '../auth/serverRefusal';
import type { HandlerContext } from '../handlers/interfaces';
import { isEnded, own, refuseIfClosed, runAsOwner } from '../ownedConnections';
import { closeQuietly, openFreshConnection } from '../packageSessions';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  IBackgroundRuns,
} from './contract';
import { runToolsOf } from './tools';

type Logger = HandlerContext['logger'];

/** What a run is: a run of code (cannot be cut) or a listed long read. */
export type BackgroundRunKind = 'code' | 'read';

/**
 * A running run, as its instance's owner holds it (keyed by its handle):
 * its kind, and — for a read — the cancel, which reaches the run's one
 * connection.
 */
export interface BackgroundRunControl {
  readonly kind: BackgroundRunKind;
  /**
   * Cancels the run: marked cancelled, its connection logged off, the
   * cancelled answer kept (`finish`). Answers `cancelled`, or `finished`
   * when its end came first (its answer then kept). Called for a read only.
   */
  cancel(): Promise<'cancelled' | 'finished'>;
}

export interface StartBackgroundRunOptions {
  /** Where the run and its answer are kept: the host's strategy. */
  strategy: IBackgroundRuns;
  caller: BackgroundRunCaller;
  /** The run tool's name. */
  tool: string;
  /** What it is: a code run, or a listed long read. */
  kind: BackgroundRunKind;
  /** What it runs (a class or a program) or reads, upper case. */
  object: string;
  /** The instance whose call starts the run. */
  instance: object;
  /**
   * The instance's tracking of the runs it started: handed the run's own
   * connection as soon as it exists — before its `connect()` and before the
   * strategy keeps the run; answers
   * the untracking, called when the run ended. It may throw (the instance
   * closed meanwhile): the start is refused, its connection ended.
   */
  track?: (connection: IAbapConnection) => () => void;
  /**
   * The instance's owner of running runs: handed the run's control once
   * the strategy keeps it, before its work starts; answers the removal,
   * called when the run ended (or was cancelled).
   */
  register?: (handle: string, control: BackgroundRunControl) => () => void;
  /** The instance's connection: what the run's own is opened from. */
  connection: IAbapConnection;
  logger: Logger;
  /**
   * The run tool on the run's own connection, answered as the tool answers
   * (its failure included). A rejection is answered in fixed words.
   */
  run: (connection: IAbapConnection) => Promise<BackgroundRunAnswer>;
  /** The clock of `started_at` / `finished_at`. */
  now?: () => Date;
}

/** A started run, as the start answers it. */
export interface StartedBackgroundRun {
  run_handle: string;
  tool: string;
  kind: BackgroundRunKind;
  object: string;
  started_at: string;
}

/** The fixed words of a run whose answer the strategy did not take. */
export const BACKGROUND_FINISH_FAILED_WORDS =
  '[MCP] The answer of a background run could not be kept by its store';

/** The fixed words of a run that ended without an answer of the run tool. */
export const BACKGROUND_RUN_FAILED_WORDS =
  'The background run ended without an answer of the run tool.';

/** The fixed words of a read run that was cancelled. */
export const BACKGROUND_READ_CANCELLED_WORDS =
  'The read was cancelled before SAP answered: its ABAP session was logged off, and nothing was changed.';

/** The answer a cancelled read run keeps. */
export const CANCELLED_ANSWER: BackgroundRunAnswer = {
  cancelled: true,
  content: [{ type: 'text', text: BACKGROUND_READ_CANCELLED_WORDS }],
};

/**
 * Starts a background run (see the file header) and answers its handle once
 * the run's own connection is connected and the strategy keeps it — or
 * `undefined` when the shutdown (or the instance's close) already began.
 * Refused, before anything is kept or sent: no fresh connection to be had
 * (`fresh_connection_unavailable`), the caller's limit
 * (`background_run_limit`).
 */
export async function startBackgroundRun(
  options: StartBackgroundRunOptions,
): Promise<StartedBackgroundRun | undefined> {
  const { strategy, tool, logger } = options;
  const now = options.now ?? (() => new Date());
  // Registered before anything is opened: a shutdown that began refuses the
  // start, and one that begins later names the run if it forces.
  const unregister = registerActiveTool(new AbortController(), {
    instance: options.instance,
    name: `${tool} (background)`,
  });
  if (unregister === undefined) return undefined;

  let connection: IAbapConnection | undefined;
  let untrack: (() => void) | undefined;
  try {
    // The strategy's connection, not the instance's: no instance's terminal
    // close (`closeOwnedConnections`, the pool's) reaches it; the instance
    // close does through `track`, the process's logoffs (`forceClose`) do.
    // Tracked as soon as it exists, before its connect: the instance's close
    // while it connects asks its logoff at once (queued behind the connect),
    // and an instance closed while the host's factory ran refuses it here,
    // before anything is sent.
    try {
      connection = await runAsOwner(strategy, () =>
        openFreshConnection(options.connection, logger, (born) => {
          own(born, { owner: strategy, role: 'background' });
          untrack = options.track?.(born);
        }),
      );
    } catch (error) {
      // A connect its instance's close cut short: the close's refusal.
      refuseIfClosed(options.instance);
      throw error;
    }
    // Its instance closed while it connected: the close cut it.
    refuseIfClosed(options.instance);
    // Stateless: a fresh connection is, and a host's factory's is made so.
    connection.setSessionType('stateless');

    const startedAt = now().toISOString();
    const started = await strategy.start(options.caller, {
      tool,
      object: options.object,
      started_at: startedAt,
    });
    if ('refused' in started) {
      throw new ServerRefusal(
        'background_run_limit',
        backgroundRunLimitWords(started.limit, runToolsOf(tool).discard),
      );
    }

    const handle = started.handle;
    const own_ = connection;
    const keep = async (answer: BackgroundRunAnswer) => {
      try {
        await strategy.finish(handle, answer, now().toISOString());
      } catch {
        try {
          logger?.warn(BACKGROUND_FINISH_FAILED_WORDS);
        } catch {
          // A logger that throws changes nothing.
        }
      }
    };
    // The run's one end (`end.phase`): `running` until its end is being
    // kept (`ending`) or it was cancelled (`cancelled`, final). Each of the
    // two keeps its answer once; the other then keeps nothing.
    const end: { phase: 'running' | 'ending' | 'cancelled' } = {
      phase: 'running',
    };
    let ending: Promise<void> | undefined;
    let cancelling: Promise<'cancelled'> | undefined;
    let deregister: (() => void) | undefined;
    const control: BackgroundRunControl = {
      kind: options.kind,
      cancel: async () => {
        if (end.phase === 'ending' && ending !== undefined) {
          await ending;
          return 'finished';
        }
        if (cancelling !== undefined) return cancelling;
        end.phase = 'cancelled';
        cancelling = (async () => {
          // The mark first, then the logoff: SAP ends the read. The control
          // stays registered until the cancelled answer is kept, so a second
          // discard meanwhile joins this cancel.
          await closeQuietly(own_, logger, tool);
          await keep(CANCELLED_ANSWER);
          deregister?.();
          return 'cancelled' as const;
        })();
        return cancelling;
      },
    };
    deregister = options.register?.(handle, control);
    const work = runAsOwner(strategy, () => options.run(own_));
    void (async () => {
      let answer: BackgroundRunAnswer;
      try {
        answer = await work;
      } catch {
        answer = {
          isError: true,
          content: [{ type: 'text', text: BACKGROUND_RUN_FAILED_WORDS }],
        };
      }
      try {
        if (end.phase === 'cancelled') {
          // Cancelled first: its answer is kept; this end keeps nothing.
          await cancelling;
          return;
        }
        end.phase = 'ending';
        ending = (async () => {
          // SAP answered: the run's session is logged off, then the answer kept.
          await closeQuietly(own_, logger, tool);
          await keep(answer);
        })();
        await ending;
      } finally {
        deregister?.();
        untrack?.();
        unregister();
      }
    })();
    return {
      run_handle: handle,
      tool,
      kind: options.kind,
      object: options.object,
      started_at: startedAt,
    };
  } catch (error) {
    untrack?.();
    if (connection !== undefined && !isEnded(connection)) {
      await closeQuietly(connection, logger, tool);
    }
    unregister();
    throw error;
  }
}
