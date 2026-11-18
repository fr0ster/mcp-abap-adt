/**
 * The request ledger the one repeat reads (`firstRequest.ts`): a call's
 * first request refused `403` `x-csrf-token: Required` and marked
 * `sessionLost` `ADT_SESSION_REPLACED` by the connection, with no request of
 * the call answered. Our own logoff (`disconnect`: later requests refused
 * `ADT_NOT_CONNECTED`, no answer, no mark) and every other shape is not it.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  isSessionReplacedBySap,
  watchRequests,
  withRequestLedger,
} from '../../lib/firstRequest';
import { recordingConnection } from '../helpers/recordingConnection';

/** SAP's refusal of the token, as the connection throws it. */
function refusal(marked: boolean, header = true) {
  return Object.assign(new Error('Request failed with status code 403'), {
    response: {
      status: 403,
      statusText: 'Forbidden',
      headers: header ? { 'x-csrf-token': 'Required' } : {},
      data: 'CSRF token validation failed',
    },
    ...(marked ? { sessionLost: ADT_SESSION_ERROR.SESSION_REPLACED } : {}),
  });
}

/** What the connection throws for a stateful request SAP answered in a new session. */
function replaced() {
  return Object.assign(
    new Error('The SAP session this connection was using is gone'),
    {
      code: ADT_SESSION_ERROR.SESSION_REPLACED,
    },
  );
}

/** What the connection throws after our own `disconnect`. */
function notConnected() {
  return Object.assign(new Error('not connected'), {
    code: ADT_SESSION_ERROR.NOT_CONNECTED,
  });
}

/** A ledgered connection answering each request by `steps` in turn. */
function ledgered(steps: Array<Error | 'ok'>): IAbapConnection {
  const inner = recordingConnection();
  let at = 0;
  const connection: IAbapConnection = {
    ...inner,
    makeAdtRequest: async (options) => {
      const step = steps[at];
      at += 1;
      if (step instanceof Error) throw step;
      return inner.makeAdtRequest(options);
    },
  };
  return withRequestLedger(connection);
}

/** Runs `count` requests of one watched call, each settled; what the watch read. */
async function call(connection: IAbapConnection, count: number) {
  const watch = watchRequests(connection);
  for (let i = 0; i < count; i++) {
    await connection
      .makeAdtRequest({
        url: '/sap/bc/adt/x',
        method: 'POST',
        timeout: 0,
      })
      .catch(() => undefined);
  }
  return watch?.end().refusedBeforeAnyRan;
}

describe('isSessionReplacedBySap', () => {
  it('403, x-csrf-token: Required, marked sessionLost: yes', () => {
    expect(isSessionReplacedBySap(refusal(true))).toBe(true);
  });
  it('without the sessionLost mark (the same session): no', () => {
    expect(isSessionReplacedBySap(refusal(false))).toBe(false);
  });
  it('without the header (an authorization refusal): no', () => {
    expect(isSessionReplacedBySap(refusal(true, false))).toBe(false);
  });
  it("a stateful request's ADT_SESSION_REPLACED: yes", () => {
    expect(isSessionReplacedBySap(replaced())).toBe(true);
  });
  it('our own disconnect (ADT_NOT_CONNECTED, no answer, no mark): no', () => {
    expect(isSessionReplacedBySap(notConnected())).toBe(false);
  });
});

describe('watchRequests', () => {
  it('the first request refused in a new session, the rest never reached SAP: the call may run once more', async () => {
    expect(
      await call(ledgered([refusal(true), notConnected(), notConnected()]), 3),
    ).toBe(true);
  });
  it('a request answered before the refusal: no', async () => {
    expect(await call(ledgered(['ok', refusal(true)]), 2)).toBe(false);
  });
  it('the first request refused in the same session (no sessionLost): no', async () => {
    expect(await call(ledgered([refusal(false)]), 1)).toBe(false);
  });
  it('the first request a stateful SESSION_REPLACED: the call may run once more', async () => {
    expect(await call(ledgered([replaced(), notConnected()]), 2)).toBe(true);
  });
  it('a stateful SESSION_REPLACED after a request answered: no', async () => {
    expect(await call(ledgered(['ok', replaced()]), 2)).toBe(false);
  });
  it('our own disconnect: no', async () => {
    expect(await call(ledgered([notConnected()]), 1)).toBe(false);
  });
  it('a connection the factory did not build is not watched', () => {
    expect(watchRequests(recordingConnection())).toBeUndefined();
  });
  it('requests outside a watch are not counted into the next call', async () => {
    const connection = ledgered(['ok', refusal(true)]);
    await connection.makeAdtRequest({ url: '/x', method: 'GET', timeout: 0 });
    expect(await call(connection, 1)).toBe(true);
  });
});
