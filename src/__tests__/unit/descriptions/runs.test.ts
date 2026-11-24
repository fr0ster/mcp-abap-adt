/**
 * Plan step 10.6, group 7: the runs' and results' descriptions
 * (`src/lib/description/runs.ts`) — each factory's sentence pinned for two
 * tools of different objects, its facts generated from the answer type.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  purpose,
  resultReturns,
  toolDescription,
} from '../../../lib/description';
import {
  CLASS_RUN,
  PROGRAM_RUN,
  runParts,
  UNIT_TEST_RESULT,
  UNIT_TEST_RUN,
  UNIT_TEST_RUN_OR_SYNC,
  UNIT_TEST_STATUS,
  UNIT_TEST_STATUS_AND_RESULT,
  unitTestRead,
  unitTestRun,
} from '../../../lib/description/runs';
import { factFaults, purposeFaults } from './descriptionRules';

const RUN =
  "The run's id to read its status and result by, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it.";
const SYNC_RUN =
  "The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it.";

describe('the unit-test run factory', () => {
  it('names the tests run; the facts are the run answer', () => {
    assert.equal(
      toolDescription(
        unitTestRun('the ABAP Unit tests of a CDS view test class'),
      ),
      `Runs the ABAP Unit tests of a CDS view test class, waiting for the result or giving the run's id at once. ${RUN}`,
    );
  });

  it('a runner that also runs in one call adds the runner', () => {
    assert.equal(
      toolDescription(
        unitTestRun('the ABAP Unit tests of an ABAP report', 'sync'),
      ),
      `Runs the ABAP Unit tests of an ABAP report, waiting for the result or giving the run's id at once. ${SYNC_RUN}`,
    );
  });
});

describe('the unit-test read factory', () => {
  it('reads what is asked of a run by its id, waiting when it waits', () => {
    assert.equal(
      toolDescription(
        unitTestRead(
          'the result',
          'an ABAP Unit test run',
          UNIT_TEST_RESULT,
          'waits',
        ),
      ),
      "[read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it.",
    );
    assert.equal(
      toolDescription(
        unitTestRead('the status', 'a CDS unit test run', UNIT_TEST_STATUS),
      ),
      "[read-only] Reads the status of a CDS unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run.",
    );
  });
});

describe('the run factory', () => {
  it('a class run and a report run: the purpose, then the answer', () => {
    assert.equal(
      toolDescription(
        runParts({
          purpose: purpose('Runs an ABAP class.'),
          result: CLASS_RUN,
        }),
      ),
      'Runs an ABAP class. The class that ran, its console output and the profiler and trace ids of a profiled run.',
    );
    assert.equal(
      toolDescription(
        runParts({
          tag: 'read-only',
          purpose: purpose('Runs an ABAP report.'),
          result: PROGRAM_RUN,
        }),
      ),
      '[read-only] Runs an ABAP report. The report that ran, its output and the profiler id of a profiled run.',
    );
  });

  it('every shape keeps the fact rules', () => {
    for (const shape of [
      UNIT_TEST_RUN,
      UNIT_TEST_RUN_OR_SYNC,
      UNIT_TEST_RESULT,
      UNIT_TEST_STATUS,
      UNIT_TEST_STATUS_AND_RESULT,
      CLASS_RUN,
      PROGRAM_RUN,
    ]) {
      for (const fact of resultReturns(shape)) {
        assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
      }
    }
    assert.deepStrictEqual(
      purposeFaults(
        "Runs every ABAP Unit test of a function group, waiting for the result or giving the run's id at once.",
      ),
      [],
    );
  });
});
