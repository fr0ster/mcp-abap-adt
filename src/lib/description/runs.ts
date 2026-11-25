/**
 * The descriptions of the runs and their results (plan step 10.6, group 7):
 * an ABAP Unit run, a read of its status or result, an ATC run and its
 * reads, a class or program run, a profiler trace and a runtime dump. Each
 * purpose names what is run or read — the function alone (owner: a
 * description is purely functional).
 */

import type { Note } from './notes';
import { type Purpose, purpose } from './purpose';
import type { DescriptionParts, DescriptionTag } from './toolDescription';

/** A run or a read: its purpose, its tag and notes. */
export interface RunTool {
  readonly purpose: Purpose;
  readonly tag?: DescriptionTag | undefined;
  readonly notes?: readonly Note[] | undefined;
}

/** A run's or a read's parts. */
export function runParts(tool: RunTool): DescriptionParts {
  return {
    tag: tool.tag,
    purpose: tool.purpose,
    notes: tool.notes,
  };
}

/**
 * An ABAP Unit run of `tests` (`the ABAP Unit tests of an ABAP class`): it
 * waits for the result, or gives the run's id at once.
 */
export function unitTestRun(tests: string): DescriptionParts {
  return runParts({
    purpose: purpose(
      `Runs ${tests}, waiting for the result or giving the run's id at once.`,
    ),
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
  waits: 'waits' | undefined = undefined,
): DescriptionParts {
  return runParts({
    tag: 'read-only',
    purpose: purpose(
      `Reads ${what} of ${of} by its id${waits === 'waits' ? ', waiting while the run goes on' : ''}.`,
    ),
  });
}
