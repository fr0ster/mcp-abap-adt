/**
 * The descriptions of the runs and their results (plan step 10.6, group 7):
 * an ABAP Unit run, a read of its status or result, an ATC run and its
 * reads, a class or program run, a profiler trace and a runtime dump. Each
 * purpose names what is run or read; each fact comes from the answer type
 * the tool's projection builds, every member by its domain noun, so a member
 * added to an answer and not named here does not compile.
 */

import type {
  runOutcomeAnswer,
  runOutcomeWithStatus,
  runStatusAnswer,
} from '../../handlers/unit_test/shared/pollRun';
import type { projectSync } from '../../handlers/unit_test/shared/runSync';
import type { projectRun } from '../../handlers/unit_test/shared/runTests';
import type { XmlRead } from '../xml/tree';
import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import { type ResultShape, resultReturns, resultShape } from './returns';
import type { DescriptionParts, DescriptionTag } from './toolDescription';

/**
 * An answer without its `success` flag: the flag is constant on every answer
 * that reaches the model, so it tells nothing and no fact states it.
 */
export type Informative<T> = T extends unknown ? Omit<T, 'success'> : never;

/** A unit-test run's answer: asynchronous, then synchronous. */
type UnitTestRunAnswer = Informative<ReturnType<ReturnType<typeof projectRun>>>;
type SyncRunAnswer = Informative<ReturnType<ReturnType<typeof projectSync>>>;

const RUN_ID = "the run's id to read its status and result by";
const RUN_STATUS_UNSTARTED = "SAP's status of a run yet to start";
const RUN_FINISHED = 'whether the run finished';
const RUN_RESULT = "the run's result as SAP gave it";

/** What an ABAP Unit run answers, started or waited for. */
export const UNIT_TEST_RUN = resultShape<UnitTestRunAnswer>({
  run_id: RUN_ID,
  status: RUN_STATUS_UNSTARTED,
  finished: RUN_FINISHED,
  run_result: RUN_RESULT,
});

/** What an ABAP Unit run answers that also runs in one call. */
export const UNIT_TEST_RUN_OR_SYNC = resultShape<
  UnitTestRunAnswer | SyncRunAnswer
>({
  run_id: RUN_ID,
  status: RUN_STATUS_UNSTARTED,
  runner: 'the runner that ran it',
  finished: RUN_FINISHED,
  run_result: RUN_RESULT,
});

/** What a read of a run's result answers. */
export const UNIT_TEST_RESULT = resultShape<
  Informative<ReturnType<typeof runOutcomeAnswer<XmlRead>>>
>({
  run_id: "the run's id",
  status: RUN_STATUS_UNSTARTED,
  finished: RUN_FINISHED,
  run_result: RUN_RESULT,
});

/** What a read of a run's status and result answers. */
export const UNIT_TEST_STATUS_AND_RESULT = resultShape<
  Informative<ReturnType<typeof runOutcomeWithStatus<XmlRead>>>
>({
  run_id: "the run's id",
  status: RUN_STATUS_UNSTARTED,
  finished: RUN_FINISHED,
  run_status: "SAP's progress of the run",
  run_result: RUN_RESULT,
});

/** What a read of a run's status answers. */
export const UNIT_TEST_STATUS = resultShape<ReturnType<typeof runStatusAnswer>>(
  {
    run_id: "the run's id",
    finished: RUN_FINISHED,
    run_status: "SAP's progress status of the run",
  },
);

/** A run or a read: its purpose, its answer, its tag and notes. */
export interface RunTool {
  readonly purpose: Purpose;
  readonly result: ResultShape;
  readonly tag?: DescriptionTag | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** A run's or a read's parts: its purpose, then its answer's facts. */
export function runParts(tool: RunTool): DescriptionParts {
  return {
    tag: tool.tag,
    purpose: tool.purpose,
    returns: resultReturns(tool.result),
    notes: tool.notes,
  };
}

/**
 * An ABAP Unit run of `tests` (`the ABAP Unit tests of an ABAP class`): it
 * waits for the result, or gives the run's id at once. `sync` for a tool
 * whose runner also runs it in one call.
 */
export function unitTestRun(
  tests: string,
  sync: 'sync' | undefined = undefined,
): DescriptionParts {
  return runParts({
    purpose: purpose(
      `Runs ${tests}, waiting for the result or giving the run's id at once.`,
    ),
    result: sync === 'sync' ? UNIT_TEST_RUN_OR_SYNC : UNIT_TEST_RUN,
  });
}

/**
 * A read of a unit-test run by its id: `what` is read (`the result`), `of`
 * the run (`an ABAP Unit test run`); `waits` when it waits while the run
 * goes on.
 */
export function unitTestRead(
  what: string,
  of: string,
  result: ResultShape,
  waits: 'waits' | undefined = undefined,
): DescriptionParts {
  return runParts({
    tag: 'read-only',
    purpose: purpose(
      `Reads ${what} of ${of} by its id${waits === 'waits' ? ', waiting while the run goes on' : ''}.`,
    ),
    result,
  });
}
