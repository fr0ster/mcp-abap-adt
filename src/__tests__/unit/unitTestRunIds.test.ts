/**
 * An ABAP Unit run id reaches SAP as one path segment (adt-clients 43, #3):
 * the status and result reads percent-encode it, and a run id of exactly
 * `.` or `..` — a path step, not a run — is refused before anything is sent,
 * and the tool answers that refusal.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { type McpResult, recordCase } from '../helpers/pinCases';

/** What `tool` sends and answers for `runId` on premise. */
async function ran(tool: string, runId: string) {
  const recording = await recordCase({
    tool,
    variant: 'onprem',
    stand: 'recording',
    args: { run_id: runId },
    expected: 'none',
  });
  return recording;
}

const textOf = (answer: McpResult | undefined): string =>
  answer?.content.map((item) => item.text).join('\n') ?? '';

describe('a unit-test run id is one path segment', () => {
  for (const [tool, path] of [
    ['HandlerUnitTestStatus', '/sap/bc/adt/abapunit/runs/a%2Fb%3Fc%23d%25'],
    ['HandlerUnitTestResult', '/sap/bc/adt/abapunit/results/a%2Fb%3Fc%23d%25'],
  ]) {
    it(format('%s encodes the run id', tool), async () => {
      const recording = await ran(tool, 'a/b?c#d%');
      assert.equal(recording.requests.length, 1);
      assert.equal(recording.requests[0]?.url.startsWith(path), true);
    });
  }

  for (const [tool, runId] of [
    ['HandlerUnitTestStatus', '.'],
    ['HandlerUnitTestStatus', '..'],
    ['HandlerUnitTestResult', '.'],
    ['HandlerUnitTestResult', '..'],
  ]) {
    it(
      format('%s refuses the run id %s, sending nothing', tool, runId),
      async () => {
        const recording = await ran(tool, runId);
        assert.equal(recording.thrown, undefined);
        assert.deepStrictEqual(recording.requests, []);
        assert.equal(recording.answer?.isError, true);
        assert.ok(
          textOf(recording.answer).includes('is a path step, not a run'),
        );
      },
    );
  }
});
