/**
 * `ListTransports` lists by user, with no saved configuration (the owner,
 * 2026-11-18): one `GET /sap/bc/adt/cts/transportrequests` with the query
 * SAP's handler reads — `user`, `requestStatus` and `requestType` — sent
 * by real adt-clients code over `recordingConnection`. No search
 * configuration is read, and the answer is every request SAP returned: SAP
 * selects the requests the user owns or holds a task in.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { handleListTransports as handleListTransportsOf } from '../../handlers/transport/readonly/handleListTransports';
import { runWithRequestContext } from '../../lib/requestContext';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/** handleListTransports at `detail: 'medium'`, the answer these cases compare (terse answers, step 3). */
const handleListTransports = (
  context: Parameters<typeof handleListTransportsOf>[0],
  args: Parameters<typeof handleListTransportsOf>[1],
) => handleListTransportsOf(context, { detail: 'medium', ...args });

const COLLECTION = '/sap/bc/adt/cts/transportrequests';

/** A listing with one modifiable request of another owner and one released request. */
const LISTING =
  '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">' +
  '<tm:workbench tm:category="Workbench"><tm:target tm:name="/TARGET/">' +
  '<tm:modifiable><tm:request tm:number="PFXK900001" tm:owner="OTHER_OWNER" tm:desc="a request whose task the user holds" tm:type="K" tm:status="D"/></tm:modifiable>' +
  '<tm:released><tm:request tm:number="PFXK900002" tm:owner="SESSION_USER" tm:desc="released" tm:type="K" tm:status="R"/></tm:released>' +
  '</tm:target></tm:workbench></tm:root>';

/** What a call sent and answered, its session's login `session_user`. */
async function sentFor(args: Parameters<typeof handleListTransports>[1]) {
  return sentAs({ login: 'session_user' }, args, [{ data: LISTING }]);
}

/** What a call sent and answered in a request scope stating `scope`. */
async function sentAs(
  scope: Parameters<typeof runWithRequestContext>[0],
  args: Parameters<typeof handleListTransports>[1],
  answers: Parameters<typeof recordingConnection>[0],
) {
  const connection = recordingConnection(answers);
  declareSystemKind(connection, 'onprem');
  const answered = await runWithRequestContext(scope, () =>
    handleListTransports({ connection }, args),
  );
  return { answered, requests: connection.requests };
}

describe('ListTransports sends the query by user', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'design_owner',
    });
  });
  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  // Each level's reading is pure (Codex P2): it reads the answer and
  // nothing else, the logger included.
  it('the reading logs nothing: a logger refusing its lines changes nothing', async () => {
    const connection = recordingConnection([{ data: LISTING }]);
    declareSystemKind(connection, 'onprem');
    const logger = {
      debug() {},
      warn() {},
      error() {},
      info(message: unknown) {
        if (String(message).startsWith('ListTransports')) {
          throw new Error('the reading logged');
        }
      },
    };
    const answered = await runWithRequestContext(
      { login: 'session_user' },
      () => handleListTransportsOf({ connection, logger } as never, {}),
    );
    assert.equal(answered.isError === true, false, JSON.stringify(answered));
  });

  it("the session's login, not the responsible: modifiable requests of every type", async () => {
    const { requests } = await sentFor({});
    assert.deepStrictEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      [`GET ${COLLECTION}?user=SESSION_USER&requestStatus=D&requestType=KWT`],
    );
  });

  it('login and responsible both stated (systeminformation unavailable): the login', async () => {
    const { requests } = await sentAs(
      { login: 'alice', responsible: 'design_owner' },
      {},
      [{ data: LISTING }],
    );
    assert.deepStrictEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      [`GET ${COLLECTION}?user=ALICE&requestStatus=D&requestType=KWT`],
    );
  });

  it("no login stated: the system's user, as systeminformation names it", async () => {
    const { requests } = await sentAs({ responsible: 'design_owner' }, {}, [
      { data: '{"userName":"bob","systemID":"SID"}' },
      { data: LISTING },
    ]);
    assert.deepStrictEqual(
      requests.map((r) => r.url),
      [
        '/sap/bc/adt/core/http/systeminformation',
        `${COLLECTION}?user=BOB&requestStatus=D&requestType=KWT`,
      ],
    );
  });

  it('no login and no system user: an error, and no listing is sent', async () => {
    const { answered, requests } = await sentAs(
      { responsible: 'design_owner' },
      {},
      [{ status: 404, statusText: 'Not Found', data: '' }],
    );
    assert.equal(answered.isError, true);
    const [first] = answered.content ?? [];
    assert.ok(first?.text.includes('Pass `user`'));
    assert.deepStrictEqual(
      requests.map((r) => r.url),
      ['/sap/bc/adt/core/http/systeminformation'],
    );
  });

  it('another user, named by the argument', async () => {
    const { requests } = await sentFor({ user: ' other_user ' });
    assert.deepStrictEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      [`GET ${COLLECTION}?user=OTHER_USER&requestStatus=D&requestType=KWT`],
    );
  });

  it('modifiable_only false: modifiable and released', async () => {
    const { requests } = await sentFor({ modifiable_only: false });
    assert.deepStrictEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      [`GET ${COLLECTION}?user=SESSION_USER&requestStatus=DR&requestType=KWT`],
    );
  });

  it('reads no search configuration', async () => {
    for (const args of [
      {},
      { user: 'other_user' },
      { modifiable_only: false },
    ]) {
      const { requests } = await sentFor(args);
      assert.deepStrictEqual(
        requests.filter((r) => r.url.includes('searchconfiguration')),
        [],
      );
      assert.equal(requests.length, 1);
    }
  });

  it('answers every request SAP returned, whoever owns it and whatever its status', async () => {
    const { answered } = await sentFor({});
    assert.equal(answered.isError, false);
    const [first] = answered.content ?? [];
    assert.deepStrictEqual(JSON.parse(first?.text ?? 'null'), {
      success: true,
      count: 2,
      transports: [
        {
          number: 'PFXK900001',
          description: 'a request whose task the user holds',
          type: 'K',
          status: 'D',
          owner: 'OTHER_OWNER',
          target: '',
        },
        {
          number: 'PFXK900002',
          description: 'released',
          type: 'K',
          status: 'R',
          owner: 'SESSION_USER',
          target: '',
        },
      ],
    });
  });

  it('the recorded listing is answered as SAP sent it', async () => {
    const body = corpusBody(
      'read-transport-list-structure--01-cts-transportrequests',
    );
    const { answered } = await sentAs({ login: 'session_user' }, {}, [
      { data: body },
    ]);
    const [first] = answered.content ?? [];
    assertMatchObject(JSON.parse(first?.text ?? 'null'), {
      success: true,
      count: 1,
      transports: [{ number: 'TRLK900438', owner: 'SAPUSER01' }],
    });
  });
});
