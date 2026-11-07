/**
 * Background runs: the strategy's contract.
 *
 * Two kinds of run, decided by the tool that starts it:
 *
 * - **a code run** (`RuntimeRunClass`, `RuntimeRunProgram`, compact's
 *   `HandlerProfileRun`, with `background: true`) cannot be cut: a running
 *   synchronous request dies with its socket or its session, and its write
 *   is lost. Its kept answer stays until `DiscardBackgroundRun`;
 * - **a read run** (every listed long tool, `background` defaulting to
 *   `true`) only reads: `DiscardBackgroundRun` on a running one cancels it —
 *   its connection is logged off, and the run is kept with a cancelled
 *   answer (`cancelled: true`). A read run's finished or cancelled answer is
 *   removed once a read of it answered it (the library calls `discard` right
 *   after).
 *
 * Either way the call answers at once with a handle; the library runs the
 * request on one connection of its own, waits for SAP's answer (or the
 * cancel), logs that connection off, and hands the answer to the strategy
 * (`finish`, once per run).
 *
 * **The strategy decides only where runs and their answers are kept and how
 * a handle is found** — the servers' in memory
 * (`@mcp-abap-adt/background-runs-memory`, created by the launchers; lib
 * ships no implementation), an embedder's its own (a store of its choosing,
 * its own routing between replicas). The library holds no default: an
 * instance without a strategy refuses a code run's `background: true` in
 * fixed words, and runs a listed long tool in the call.
 *
 * **Every call is checked against the caller.** The caller is the
 * destination identity (URL, client) and the backend user the request
 * resolved. A handle is not authorization: `get` and `discard` of an
 * unknown handle and of someone else's answer the same — not available.
 *
 * **No timeouts.** A finished code run's answer stays until the caller
 * discards it or the store ends (the server's: with the process); a read
 * run's until it is read once. A limit per caller
 * (running plus kept) keeps forgotten runs from piling up: a start beyond it
 * is refused (`{ refused: 'limit', limit }`).
 *
 * Every method may answer a value or a promise of one.
 */

/** Who calls: the destination identity and the backend user its request resolved. */
export interface BackgroundRunCaller {
  /** The system's URL, without a trailing slash. */
  readonly url: string;
  /** The client; `''` when none is stated. */
  readonly client: string;
  /** The backend user, upper case. */
  readonly user: string;
}

/**
 * What the run tool answered: its content, and `isError` when it failed;
 * `cancelled` when a read run was cancelled before SAP answered (its
 * content then the fixed words of the cancel).
 */
export interface BackgroundRunAnswer {
  readonly content: ReadonlyArray<{ type: 'text'; text: string }>;
  readonly isError?: true;
  readonly cancelled?: true;
}

/** What a run is, as it starts. */
export interface BackgroundRunStart {
  /** The run tool's name. */
  readonly tool: string;
  /**
   * The object it runs (a class or a program name), upper case; for a read,
   * the object it names first (upper case), `''` when it names none.
   */
  readonly object: string;
  /** When it started, ISO 8601. */
  readonly started_at: string;
}

/**
 * A run's state: `running`; `finished` with an answer; `cancelled` — a kept
 * answer carrying `cancelled: true`.
 */
export type BackgroundRunState = 'running' | 'finished' | 'cancelled';

/** A run as listed: no output. */
export interface BackgroundRunListing extends BackgroundRunStart {
  readonly run_handle: string;
  readonly state: BackgroundRunState;
  /** When SAP answered (or the cancel came), ISO 8601; only when it ended. */
  readonly finished_at?: string;
}

/** A run as read: an ended one carries its answer. */
export type BackgroundRunRecord =
  | (BackgroundRunListing & { readonly state: 'running' })
  | (BackgroundRunListing & {
      readonly state: 'finished' | 'cancelled';
      readonly finished_at: string;
      readonly answer: BackgroundRunAnswer;
    });

/** A start: the new run's handle, or refused at the caller's limit. */
export type BackgroundRunStarted =
  | { readonly handle: string }
  | { readonly refused: 'limit'; readonly limit: number };

/**
 * A discard: removed (a finished or cancelled run), refused because it
 * still runs, or not available (unknown, someone else's — the same answer).
 */
export type BackgroundRunDiscarded = 'discarded' | 'running' | 'not-available';

type Answer<T> = T | Promise<T>;

/** Where background runs and their answers are kept: the host's strategy. */
export interface IBackgroundRuns {
  /**
   * Records a new run of `caller`, running; answers its handle (opaque, at
   * least 128 random bits), or refuses it at the caller's limit.
   */
  start(
    caller: BackgroundRunCaller,
    run: BackgroundRunStart,
  ): Answer<BackgroundRunStarted>;
  /**
   * The run `handle` ended: SAP answered (`answer`, as the run tool would
   * have answered it, an error included) and its connection was logged off;
   * or a read run was cancelled (`answer.cancelled`, its connection logged
   * off). Called once per started run, by the library. A kept answer with
   * `cancelled: true` is read and listed as `state: 'cancelled'`.
   */
  finish(
    handle: string,
    answer: BackgroundRunAnswer,
    finishedAt: string,
  ): Answer<void>;
  /** The caller's run `handle`; `undefined` for an unknown handle and someone else's alike. */
  get(
    handle: string,
    caller: BackgroundRunCaller,
  ): Answer<BackgroundRunRecord | undefined>;
  /** The caller's runs, running, finished and cancelled; no output. */
  list(caller: BackgroundRunCaller): Answer<BackgroundRunListing[]>;
  /** Removes the caller's ended run `handle`; a running one is not removed. */
  discard(
    handle: string,
    caller: BackgroundRunCaller,
  ): Answer<BackgroundRunDiscarded>;
}
