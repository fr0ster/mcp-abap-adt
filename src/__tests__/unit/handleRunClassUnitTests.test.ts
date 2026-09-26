/**
 * `RunClassUnitTestsLow` — the envelope-unwrap defect the fix round found.
 *
 * `unitTest.run(...)` answers an `IAdtResponse`, not the run id directly.
 * Treating the envelope itself as `run_id` (the pre-fix shape) serialises an
 * object with only its `ok` field — `getResult`/`getError` are methods, not
 * JSON — and `if (!runId)` never fires because both a success and a refusal
 * envelope are truthy objects. So a refused run answered `success: true`
 * with a garbled `run_id`, the same false-success shape this migration
 * exists to remove, on the tool that starts a run.
 */

import { analyseUnitTestStart } from '@mcp-abap-adt/adt-strategies';
import { handleRunClassUnitTests } from '../../handlers/class/low/handleRunClassUnitTests';
import { corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

let unitTest: Record<string, unknown>;
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({ getUnitTest: () => unitTest }),
}));

const context = { connection: {} as any, logger: undefined };

const args = {
  tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }],
};

describe('RunClassUnitTestsLow', () => {
  it('reads the run id, status and location out of the start answer', async () => {
    // adt-clients 23: `run` is read with `wireItself` here, and the id comes
    // out of the header with `unitTestRunId` — against the captured start.
    const sidecar = corpusSidecar('unittest-run-passing--01-abapunit-runs');
    const wire = {
      data: corpusBody('unittest-run-passing--01-abapunit-runs'),
      status: sidecar.response.status,
      headers: sidecar.response.headers,
    };
    const run = jest.fn(async () => okResponse(wire));
    unitTest = { run };

    const result: any = await handleRunClassUnitTests(context as any, args);

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.content[0].text);
    expect(body.run_id).toBe('FA53C505DD7B1FD1ABB8599833A05D44');
    expect(body.status_code).toBe(sidecar.response.status);
    expect(body.location).toContain('FA53C505DD7B1FD1ABB8599833A05D44');
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ analyse: analyseUnitTestStart }),
    );
  });

  it('does not mask a refusal as success — the envelope is truthy either way', async () => {
    const run = jest.fn(async () =>
      refusedResponse('Class ZCL_X does not exist'),
    );
    unitTest = { run };

    const result: any = await handleRunClassUnitTests(context as any, args);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('Class ZCL_X does not exist');
  });
});
