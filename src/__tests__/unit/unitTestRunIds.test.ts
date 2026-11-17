/**
 * An ABAP Unit run id reaches SAP as one path segment (adt-clients 43, #3):
 * the status and result reads percent-encode it, and a run id of exactly
 * `.` or `..` — a path step, not a run — is refused before anything is sent,
 * and the tool answers that refusal.
 */
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
  it.each([
    ['HandlerUnitTestStatus', '/sap/bc/adt/abapunit/runs/a%2Fb%3Fc%23d%25'],
    ['HandlerUnitTestResult', '/sap/bc/adt/abapunit/results/a%2Fb%3Fc%23d%25'],
  ])('%s encodes the run id', async (tool, path) => {
    const recording = await ran(tool, 'a/b?c#d%');
    expect(recording.requests).toHaveLength(1);
    expect(recording.requests[0]?.url.startsWith(path)).toBe(true);
  });

  it.each([
    ['HandlerUnitTestStatus', '.'],
    ['HandlerUnitTestStatus', '..'],
    ['HandlerUnitTestResult', '.'],
    ['HandlerUnitTestResult', '..'],
  ])('%s refuses the run id %s, sending nothing', async (tool, runId) => {
    const recording = await ran(tool, runId);
    expect(recording.thrown).toBeUndefined();
    expect(recording.requests).toEqual([]);
    expect(recording.answer?.isError).toBe(true);
    expect(textOf(recording.answer)).toContain('is a path step, not a run');
  });
});
