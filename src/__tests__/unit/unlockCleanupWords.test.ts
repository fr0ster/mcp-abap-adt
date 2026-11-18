/**
 * A save that landed and an unlock that met the connection's session end
 * (`ADT_SESSION_REPLACED`) or SAP's token refusal (`403`, `x-csrf-token:
 * Required`): the cleanup the answer carries — its `message`, its
 * `warning`, its failures — says it in the server's words, none of the
 * connector's or SAP's (fr0ster/mcp-abap-adt#364 review). Through
 * `withLock` and `answer()`, as a write's handler renders it.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import { answer } from '../../lib/answer';
import { CSRF_REFUSAL_WORDS } from '../../lib/csrfRefusal';
import { sessionEndWords } from '../../lib/sessionEnd';
import { withLock } from '../../lib/strategies/withLock';

const PROSE =
  'The SAP session this connection was using is gone and the requests are now on a different one. What to do about it is yours. Nothing is retried here.';
const SAP_WORDS = 'CSRF token validation failed';

function ok<T>(value: T): IAdtResponse<T, IAdtError> {
  return { ok: true, getResult: () => ({ value, raw: '', status: 200 }) };
}

function failed(error: IAdtError): IAdtResponse<never, IAdtError> {
  return { ok: false, getError: () => error };
}

/** The answer of a write whose save landed and whose unlock met `unlock`. */
async function answered(unlock: IAdtError | Error) {
  const result = await answer(
    { tool: 'UpdateClass', detail: 'terse' },
    () =>
      withLock(
        async () => ok('handle-1'),
        async () => ok('saved'),
        async () => {
          if (unlock instanceof Error) throw unlock;
          return failed(unlock);
        },
        { type: 'CLASS', name: 'OBJ' },
      ),
    (value) => value,
  );
  const [first] = result.content;
  return first?.text ?? '';
}

describe("an unlock's cleanup says the session end in the server's words", () => {
  it('ADT_SESSION_REPLACED on the unlock (a refused answer)', async () => {
    const text = await answered({
      origin: 'connection',
      message: PROSE,
      sessionError: ADT_SESSION_ERROR.SESSION_REPLACED,
    });
    expect(text).not.toContain('Nothing is retried');
    expect(text).not.toContain(PROSE);
    expect(text).toContain(
      sessionEndWords(ADT_SESSION_ERROR.SESSION_REPLACED, 'unlock'),
    );
  });

  it('ADT_SESSION_REPLACED thrown by the unlock', async () => {
    const text = await answered(
      Object.assign(new Error(PROSE), {
        code: ADT_SESSION_ERROR.SESSION_REPLACED,
      }),
    );
    expect(text).not.toContain(PROSE);
    expect(text).toContain(
      sessionEndWords(ADT_SESSION_ERROR.SESSION_REPLACED, 'unlock'),
    );
  });

  it("SAP's token refusal on the unlock", async () => {
    const text = await answered({
      origin: 'connection',
      message: SAP_WORDS,
      response: {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'x-csrf-token': 'Required' },
        data: SAP_WORDS,
      },
    });
    expect(text).not.toContain(SAP_WORDS);
    expect(text).toContain(CSRF_REFUSAL_WORDS);
  });
});
