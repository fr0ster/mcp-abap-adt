/**
 * The ATC live case polls a run until its status (D27, step 13): on the ADT
 * stand-in, through `GetATCRunStatus` as the live case calls it, a run that
 * answers `running` more times than the old limit allowed — `poll_timeout_ms`
 * 120000 at `poll_interval_ms` 3000 is 40 polls, and the clock (mocked) moves
 * 10 s per answer, past any 120 s deadline — is answered, and the poll ends
 * on the first `finished`, as `handleGetATCRunStatus` reads it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetATCRunStatus } from '../../../handlers/atc/high/handleGetATCRunStatus';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { pollUntilFinished } from '../../integration/helpers/atcRun';
import { endTestConnection } from '../../integration/helpers/openConnections';

const RUN = '/sap/bc/adt/atc/runs/RUN1';
/** More `running` answers than 40 polls allow. */
const RUNNING = 50;

let stand: AdtStandIn;
let connection: IAbapConnection;

before(async () => {
  stand = await adtStandIn();
  connection = createAbapConnection(
    { url: stand.url, client: '100', authType: 'basic', username: 'U' },
    new BasicAuthProvider('U', 'p'),
    undefined,
    undefined,
    undefined,
    'onprem',
  );
  await connection.connect();
});

after(async () => {
  await endTestConnection(connection);
  await stand.close();
});

describe('the ATC case polls until the run status', () => {
  it("polls past any old limit, and ends on the first 'finished'", async () => {
    mock.timers.enable({ apis: ['Date'] });
    let answered = 0;
    stand.respond(
      (request) => request.method === 'GET' && request.url.startsWith(RUN),
      () => {
        answered += 1;
        mock.timers.tick(10_000);
        const status = answered > RUNNING ? 'finished' : 'running';
        return {
          status: 200,
          headers: { 'content-type': 'application/xml' },
          text: `<?xml version="1.0" encoding="utf-8"?><atc:run xmlns:atc="http://www.sap.com/adt/atc" status="${status}"/>`,
        };
      },
    );
    try {
      const polls = await pollUntilFinished(async () => {
        const polled = await handleGetATCRunStatus(
          { connection },
          { run_id: 'RUN1' },
        );
        assert.equal(polled.isError, false);
        const text = polled.content.find((part) => part.type === 'text')?.text;
        const status: unknown = JSON.parse(text ?? '');
        assert.ok(typeof status === 'object' && status !== null);
        const finished: unknown = Reflect.get(status, 'is_finished');
        assert.equal(typeof finished, 'boolean');
        return finished === true;
      });
      assert.equal(polls, RUNNING + 1);
      assert.equal(answered, RUNNING + 1);
    } finally {
      mock.timers.reset();
    }
  });
});
