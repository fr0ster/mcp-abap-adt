/**
 * A background run: the run tool on a connection of its own, which the call
 * that starts it does not wait for.
 *
 * - **its own connection** — opened through the fresh-connection path
 *   (`openFreshConnection`, spec §4.3): a sibling of a connection the server
 *   built, or the host's `freshConnection`; on an injected connection
 *   without one the start is refused with D20's words, before anything is
 *   kept. Stateless. It is the server's (role `background`), owned by the
 *   strategy, not by the instance whose call started it: the instance's
 *   terminal close does not cut it (an HTTP request's instance ends with its
 *   request; the run goes on);
 * - **never cut by the server's own ends** — the run is registered in the
 *   registry of live tools (`activeTools`) under the instance whose call
 *   started it, so the orderly shutdown (`settled()`) and that instance's
 *   close (`settled(instance)`) wait for it, as for a running tool; only the
 *   forced close logs its connection off at once, which cuts it (the
 *   user's escape), and names it among what was still running;
 * - **its end** — once SAP answered: the connection is logged off
 *   (`disconnect()`), then the answer is handed to the strategy (`finish`),
 *   then the run leaves the registry. An answer is what the run tool would
 *   have answered, an error included.
 *
 * No timer: the run ends when SAP answers.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { registerActiveTool } from '../activeTools';
import { backgroundRunLimitWords, ServerRefusal } from '../auth/serverRefusal';
import type { HandlerContext } from '../handlers/interfaces';
import { isEnded, own, runAsOwner } from '../ownedConnections';
import { closeQuietly, openFreshConnection } from '../packageSessions';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  IBackgroundRuns,
} from './contract';
import { BACKGROUND_TOOLS } from './tools';

type Logger = HandlerContext['logger'];

export interface StartBackgroundRunOptions {
  /** Where the run and its answer are kept: the host's strategy. */
  strategy: IBackgroundRuns;
  caller: BackgroundRunCaller;
  /** The run tool's name. */
  tool: string;
  /** What it runs (a class or a program), upper case. */
  object: string;
  /** The instance whose call starts the run: its close waits for the run. */
  instance: object;
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
  object: string;
  started_at: string;
}

/** The fixed words of a run whose answer the strategy did not take. */
export const BACKGROUND_FINISH_FAILED_WORDS =
  '[MCP] The answer of a background run could not be kept by its store';

/** The fixed words of a run that ended without an answer of the run tool. */
export const BACKGROUND_RUN_FAILED_WORDS =
  'The background run ended without an answer of the run tool.';

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
  // start, and one that begins later waits for the run.
  const unregister = registerActiveTool(new AbortController(), {
    instance: options.instance,
    name: `${tool} (background)`,
  });
  if (unregister === undefined) return undefined;

  let connection: IAbapConnection | undefined;
  try {
    // The strategy's connection, not the instance's: no instance's terminal
    // close reaches it; the forced close does.
    connection = await runAsOwner(strategy, () =>
      openFreshConnection(options.connection, logger),
    );
    own(connection, { owner: strategy, role: 'background' });
    // Stateless (§5.7): a fresh connection is, and a host's factory's is made so.
    const typed = connection as { setSessionType?: (type: string) => void };
    if (typeof typed.setSessionType === 'function') {
      typed.setSessionType('stateless');
    }

    const startedAt = now().toISOString();
    const started = await strategy.start(options.caller, {
      tool,
      object: options.object,
      started_at: startedAt,
    });
    if ('refused' in started) {
      throw new ServerRefusal(
        'background_run_limit',
        backgroundRunLimitWords(
          started.limit,
          BACKGROUND_TOOLS[tool]?.discard ?? 'DiscardBackgroundRun',
        ),
      );
    }

    const handle = started.handle;
    const own_ = connection;
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
        // SAP answered: the run's session is logged off, then the answer kept.
        await closeQuietly(own_, logger, tool);
        try {
          await strategy.finish(handle, answer, now().toISOString());
        } catch {
          try {
            logger?.warn(BACKGROUND_FINISH_FAILED_WORDS);
          } catch {
            // A logger that throws changes nothing.
          }
        }
      } finally {
        unregister();
      }
    })();
    return {
      run_handle: handle,
      tool,
      object: options.object,
      started_at: startedAt,
    };
  } catch (error) {
    if (connection !== undefined && !isEnded(connection)) {
      await closeQuietly(connection, logger, tool);
    }
    unregister();
    throw error;
  }
}
