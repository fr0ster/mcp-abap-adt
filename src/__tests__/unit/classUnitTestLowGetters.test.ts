/**
 * `GetClassUnitTestResultLow`/`GetClassUnitTestStatusLow` — task 25, fix
 * round 1.
 *
 * Pins the masking bug the reviewer found: `getUnitTest()`'s `getResult`/
 * `getStatus` already answer `IAdtResponse<string>` under adt-clients 19 (see
 * `ITestRunInformation` in `@mcp-abap-adt/interfaces` and the shipped
 * `AdtUnitTest.d.ts`), not the pre-19 transport frame with `.data` on it. A
 * cast of the envelope `as AxiosResponse` reads `.data` off an object that
 * has no such field — `undefined` every time — so a refusal (`ok: false`)
 * and a success both answered `{isError:false, content:[{text: undefined}]}`.
 * These tests fail against that cast and pass against the `answer()`-based
 * fix: reintroducing `return_response(x as AxiosResponse)` in place of
 * `answer(...)` turns both "unwraps success text" tests red (empty/undefined
 * text instead of the real document) and both "does not mask a refusal"
 * tests red (`isError: false` instead of `true`).
 */
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { handleGetClassUnitTestResult } from '../../handlers/class/low/handleGetClassUnitTestResult';
import { handleGetClassUnitTestStatus } from '../../handlers/class/low/handleGetClassUnitTestStatus';
import { okResponse, refusedResponse } from '../helpers/fakeClient';

let unitTest: Record<string, unknown>;
let throwOnClientCreate = false;
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => {
    if (throwOnClientCreate) {
      throw new Error('connection lost');
    }
    return { getUnitTest: () => unitTest };
  },
}));

const context = { connection: {} as any, logger: undefined };

afterEach(() => {
  throwOnClientCreate = false;
});

describe('GetClassUnitTestResultLow', () => {
  it('answers the result document as text on success', async () => {
    const getResult = jest.fn(async () => okResponse('<aunit:runResult/>'));
    unitTest = { getResult };

    const result: any = await handleGetClassUnitTestResult(
      context as any,
      { run_id: 'run-1' } as any,
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('<aunit:runResult/>');
    expect(getResult).toHaveBeenCalledWith('run-1', {
      withNavigationUris: undefined,
      format: undefined,
      analyse: analyseException,
    });
  });

  it('does not mask a refusal as success — the defect this fix round removed', async () => {
    const getResult = jest.fn(async () =>
      refusedResponse('Run run-1 not found'),
    );
    unitTest = { getResult };

    const result: any = await handleGetClassUnitTestResult(
      context as any,
      { run_id: 'run-1' } as any,
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('Run run-1 not found');
  });

  it('answers an error result, does not reject, when client construction throws — fix round 2: the outer guard removed by fix round 1', async () => {
    throwOnClientCreate = true;

    await expect(
      handleGetClassUnitTestResult(
        context as any,
        {
          run_id: 'run-1',
        } as any,
      ),
    ).resolves.toMatchObject({ isError: true });
  });
});

describe('GetClassUnitTestStatusLow', () => {
  it('answers the status document as text on success', async () => {
    const getStatus = jest.fn(async () => okResponse('<aunit:runStatus/>'));
    unitTest = { getStatus };

    const result: any = await handleGetClassUnitTestStatus(
      context as any,
      { run_id: 'run-2' } as any,
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('<aunit:runStatus/>');
    expect(getStatus).toHaveBeenCalledWith('run-2', true, {
      analyse: analyseException,
    });
  });

  it('does not mask a refusal as success — the defect this fix round removed', async () => {
    const getStatus = jest.fn(async () =>
      refusedResponse('Run run-2 not found'),
    );
    unitTest = { getStatus };

    const result: any = await handleGetClassUnitTestStatus(
      context as any,
      { run_id: 'run-2' } as any,
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('Run run-2 not found');
  });

  it('answers an error result, does not reject, when client construction throws — fix round 2: the outer guard removed by fix round 1', async () => {
    throwOnClientCreate = true;

    await expect(
      handleGetClassUnitTestStatus(
        context as any,
        {
          run_id: 'run-2',
        } as any,
      ),
    ).resolves.toMatchObject({ isError: true });
  });
});
