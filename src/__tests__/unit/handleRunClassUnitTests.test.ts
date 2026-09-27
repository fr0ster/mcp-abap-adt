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
 *
 * Since adt-clients 23 the id arrives through the `run` slot of the result set
 * the handler injects — `runIdWithWire`, which answers the id with the status
 * and the location beside it, because the client no longer keeps a wire
 * response to ask for them afterwards. So these fakes answer that shape, and
 * the mocked `getUnitTest` takes the injected set the way the real one does.
 */
import { handleRunClassUnitTests } from '../../handlers/class/low/handleRunClassUnitTests';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

let unitTest: Record<string, unknown>;
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({ getUnitTest: (_results?: unknown) => unitTest }),
}));

const context = { connection: {} as any, logger: undefined };

const args = {
  tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }],
};

describe('RunClassUnitTestsLow', () => {
  it('unwraps the real run id from a successful run — not the envelope', async () => {
    const run = jest.fn(async () =>
      okResponse({ runId: 'run-42', status: 201, location: '/runs/run-42' }),
    );
    unitTest = { run };

    const result: any = await handleRunClassUnitTests(context as any, args);

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.content[0].text);
    expect(body.run_id).toBe('run-42');
    // The two wire facts the client stopped remembering, answered by the
    // result strategy instead of quietly emptied.
    expect(body.status_code).toBe(201);
    expect(body.location).toBe('/runs/run-42');
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
