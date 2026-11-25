/**
 * A group activation waits for its run on long polling alone (owner's
 * decision (b)): every status read is `?withLongPolling=true`, which SAP
 * holds until the run ends (measured on premise and on the cloud trial,
 * 2026-11-04); a status that is not terminal is followed by another long
 * poll — no timer between reads, and no attempt limit. Then the results are
 * read.
 *
 * Each case runs `ActivateObjectLow`'s group path over a recording
 * connection — real adt-clients code, no SAP: the run start (`202`, the run
 * id in `Location`), the run's status reads, its results.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleActivateObject as handleActivateObjectOf } from '../../handlers/common/low/handleActivateObject';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import {
  getTimerCount,
  useFakeTimers,
  useRealTimers,
} from '../helpers/fakeTime';
import { setSystemContext } from '../helpers/processSystemContext';
import {
  RUNS_DISCOVERY,
  recordingConnection,
} from '../helpers/recordingConnection';

/** handleActivateObject at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleActivateObject = (
  context: Parameters<typeof handleActivateObjectOf>[0],
  args: Parameters<typeof handleActivateObjectOf>[1],
) => handleActivateObjectOf(context, { detail: 'full', ...args });

const RUN_ID = 'RUN0001';
const RUNS = 'xmlns:runs="http://www.sap.com/adt/activation/runs"';

const STARTED = {
  status: 202,
  headers: { location: `/sap/bc/adt/activation/runs/${RUN_ID}` },
};
/** A status read while the run goes on, as measured on both systems. */
const RUNNING = {
  data: `<?xml version="1.0" encoding="utf-8"?><runs:run ${RUNS} runs:status="running"/>`,
};
const FINISHED = {
  data: `<?xml version="1.0" encoding="utf-8"?><runs:run ${RUNS} runs:status="finished"/>`,
};
const RESULTS = {
  data:
    '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/>' +
    '</chkl:messages>',
};

const STATUS_URL = `/sap/bc/adt/activation/runs/${RUN_ID}?withLongPolling=true`;
const RESULTS_URL = `/sap/bc/adt/activation/results/${RUN_ID}`;

const OBJECTS = [
  { name: 'ZMCPA', type: 'PROG/P' },
  { name: 'ZMCPB', type: 'PROG/P' },
];

type Answered = { isError?: boolean; content?: readonly { text?: string }[] };

function payloadOf(answered: Answered): Record<string, unknown> {
  const [first] = answered.content ?? [];
  const parsed: unknown = JSON.parse(first?.text ?? 'null');
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('no payload');
  return Object.fromEntries(Object.entries(parsed));
}

/** The run start, `running` status answers, `finished`, the results. */
function runAnswering(runningReads: number) {
  const connection = recordingConnection([
    STARTED,
    ...Array.from({ length: runningReads }, () => RUNNING),
    FINISHED,
    RESULTS,
  ]);
  declareSystemKind(connection, 'onprem');
  return connection;
}

describe('a group activation waits for its run on long polling alone', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });

  afterEach(() => {
    useRealTimers();
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  it('every status read carries withLongPolling=true', async () => {
    const connection = runAnswering(3);
    const answered = await handleActivateObject(
      { connection },
      { objects: OBJECTS },
    );
    assert.equal(answered.isError, false);
    // The discovery read and the run's start come first.
    const reads = connection.requests
      .slice(2)
      .map((request) => `${request.method} ${request.url}`);
    assert.deepStrictEqual(reads, [
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${RESULTS_URL}`,
    ]);
  });

  it('terse, by default: the run answers its verdict alone, no objects and no prose', async () => {
    const connection = runAnswering(3);
    const answered = await handleActivateObjectOf(
      { connection },
      { objects: OBJECTS },
    );
    assert.equal(answered.isError, false);
    assert.deepStrictEqual(JSON.parse(answered.content[0]?.text ?? ''), {
      activated: true,
    });
  });

  it('no timer runs between reads', async () => {
    useFakeTimers({
      apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
    });
    const connection = runAnswering(3);
    const pendingAtReads: number[] = [];
    const answer = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = (options) => {
      pendingAtReads.push(getTimerCount());
      return answer(options);
    };
    // The wait completes without the fake clock being advanced.
    const answered = await handleActivateObject(
      { connection },
      { objects: OBJECTS },
    );
    assert.equal(answered.isError, false);
    // Seven requests: the discovery read first (fr0ster/mcp-abap-adt#351),
    // then the six the run takes.
    assert.equal(connection.requests.length, 7);
    assert.deepStrictEqual(pendingAtReads, [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(getTimerCount(), 0);
  });

  it('a run past six reads is still waited for', async () => {
    const connection = runAnswering(7);
    const payload = payloadOf(
      await handleActivateObject({ connection }, { objects: OBJECTS }),
    );
    assert.equal(payload.run_status, 'finished');
    assert.equal(payload.activated, true);
    const urls = connection.requests.map((request) => request.url);
    assert.equal(urls.filter((url) => url === STATUS_URL).length, 8);
    assert.equal(urls.at(-1), RESULTS_URL);
  });

  /**
   * A run answering `status` on every read, its reads counted: past
   * `READ_BOUND` the double refuses and records it, so a wait that does not
   * end fails the case instead of running the test out of memory. The bound is
   * this test's alone.
   */
  function answeringAlways(statusAttribute: string) {
    const READ_BOUND = 5;
    const document = `<?xml version="1.0" encoding="utf-8"?><runs:run ${RUNS}${statusAttribute}/>`;
    const connection = recordingConnection([
      STARTED,
      ...Array.from({ length: READ_BOUND }, () => ({ data: document })),
    ]);
    declareSystemKind(connection, 'onprem');
    const reads = { count: 0, overRead: false };
    const answer = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = (options) => {
      if (options.url.startsWith('/sap/bc/adt/activation/runs/')) {
        reads.count += 1;
        if (reads.count > READ_BOUND) {
          reads.overRead = true;
          throw new Error('the run was read past the test bound');
        }
      }
      return answer(options);
    };
    return { connection, reads };
  }

  for (const [_case, statusAttribute, named] of [
    ['an empty status', ' runs:status=""', 'no status'],
    ['a missing status', '', 'no status'],
    ['an unknown status', ' runs:status="paused"', '"paused"'],
  ]) {
    it(
      format('%s ends the wait as a failure naming what SAP sent', _case),
      async () => {
        const { connection, reads } = answeringAlways(statusAttribute);
        const answered = await handleActivateObject(
          { connection },
          { objects: OBJECTS },
        );
        assert.equal(reads.overRead, false);
        assert.equal(reads.count, 1);
        assert.equal(answered.isError, true);
        // A failure on our side, never dressed as SAP's answer.
        const payload = payloadOf(answered);
        assert.equal(payload.error, 'client_threw');
        assert.equal(payload.origin, undefined);
        assert.equal(payload.status, undefined);
        const message = String(payload.message);
        assert.ok(message.includes(`activation run ${RUN_ID}`));
        assert.ok(message.includes(named));
        // Nothing more is sent: no results read after a status nobody knows.
        assert.equal(
          connection.requests.some((request) => request.url === RESULTS_URL),
          false,
        );
      },
    );
  }

  it('running, then finished, is still waited for and read', async () => {
    const connection = runAnswering(2);
    const payload = payloadOf(
      await handleActivateObject({ connection }, { objects: OBJECTS }),
    );
    assert.equal(payload.run_status, 'finished');
    assert.deepStrictEqual(
      connection.requests.map((request) => request.url),
      [
        '/sap/bc/adt/discovery',
        '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
        STATUS_URL,
        STATUS_URL,
        STATUS_URL,
        RESULTS_URL,
      ],
    );
  });
});

/**
 * A run's results that are a silent checklist — `activationExecuted="false"`
 * and no message — are judged by the inactive list read once after them
 * (fr0ster/mcp-abap-adt#351): a run reference still listed is not activated;
 * none listed is nothing to activate; a read that fails decides nothing.
 * The silent results document is not recorded on the runs path: it is the
 * results document above with `activationExecuted="false"` (it carries no
 * message). The lists are the recorded S/4HANA 2025 ones — 05 names the
 * group `ZACT751P9325` and its main program, 04 is empty.
 */
describe('the read after a run whose results are silent', () => {
  // The silent results document is not recorded on the runs path: it is
  // built here from the results fixture, `activationExecuted="false"` and no
  // message (the fixture carries none).
  const SILENT_RESULTS = RESULTS.data.replace(
    'activationExecuted="true"',
    'activationExecuted="false"',
  );
  const REFUSED_RESULTS =
    '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
    '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>' +
    '<msg type="E" objName="ZMCPA"><shortText><txt>Syntax error</txt></shortText></msg>' +
    '</chkl:messages>';
  const LISTED = corpusBody(
    'activation-group-alone-s4-2025--05-inactiveobjects',
  );
  const EMPTY = corpusBody(
    'activation-reactivate-active-s4-2025--04-inactiveobjects',
  );
  const GROUP_AND_PROGRAM = [
    { name: 'ZACT751P9325', type: 'FUGR/F' },
    { name: 'ZMCPB', type: 'PROG/P' },
  ];

  /**
   * A connection answering a finished run with `results`, and the inactive
   * list with `list` — or throwing a `500` for it — recording each request.
   */
  function run(results: string, list: string | 'refused') {
    const requests: string[] = [];
    const connection: IAbapConnection = {
      async connect() {},
      async getBaseUrl() {
        return 'https://example.com';
      },
      getSessionId() {
        return null;
      },
      setSessionType() {},
      async makeAdtRequest<T = unknown, D = unknown>(
        options: IAbapRequestOptions,
      ): Promise<IAdtWireResponse<T, D>> {
        requests.push(`${options.method} ${options.url.split('?')[0]}`);
        const url = options.url;
        let answer: {
          status: number;
          data: string;
          headers?: Record<string, string>;
        };
        if (url.startsWith('/sap/bc/adt/discovery'))
          answer = { status: 200, data: RUNS_DISCOVERY };
        else if (url.startsWith('/sap/bc/adt/activation/runs?'))
          answer = { status: 202, data: '', headers: STARTED.headers };
        else if (url.startsWith(`/sap/bc/adt/activation/runs/${RUN_ID}`))
          answer = { status: 200, data: FINISHED.data };
        else if (url.startsWith(`/sap/bc/adt/activation/results/${RUN_ID}`))
          answer = { status: 200, data: results };
        else if (url.startsWith('/sap/bc/adt/activation/inactiveobjects')) {
          if (list === 'refused') {
            throw Object.assign(
              new Error('Request failed with status code 500'),
              {
                response: {
                  status: 500,
                  statusText: '',
                  headers: {},
                  data: '',
                },
              },
            );
          }
          answer = { status: 200, data: list };
        } else answer = { status: 200, data: '' };
        // A recorded body is text; `T` is the caller's view of it, which a
        // replay does not narrow — the assertion every fake connection makes.
        return {
          data: answer.data as T,
          status: answer.status,
          statusText: 'OK',
          headers: answer.headers ?? {},
        };
      },
    };
    declareSystemKind(connection, 'onprem');
    return { connection, requests };
  }

  const READ = 'GET /sap/bc/adt/activation/inactiveobjects';

  beforeEach(() => {
    setSystemContext({ masterSystem: 'SID', responsible: 'SAPUSER01' });
  });
  afterEach(() => resetSystemContextCache());

  it('a run reference still listed: an error naming it in still_inactive', async () => {
    const { connection, requests } = run(SILENT_RESULTS, LISTED);
    const answered = await handleActivateObject(
      { connection },
      { objects: GROUP_AND_PROGRAM },
    );
    assert.equal(answered.isError, true);
    const payload = payloadOf(answered);
    assert.deepStrictEqual(payload.still_inactive, [
      {
        name: 'ZACT751P9325',
        type: 'FUGR/F',
        uri: '/sap/bc/adt/functions/groups/zact751p9325',
      },
      {
        name: 'SAPLZACT751P9325',
        type: 'FUGR/I',
        uri: '/sap/bc/adt/functions/groups/zact751p9325/source/main',
        parent_uri: '/sap/bc/adt/functions/groups/zact751p9325',
      },
    ]);
    assert.equal(requests.filter((r) => r === READ).length, 1);
  });

  it('an empty list: nothing to activate, no error', async () => {
    const { connection } = run(SILENT_RESULTS, EMPTY);
    const answered = await handleActivateObject(
      { connection },
      { objects: GROUP_AND_PROGRAM },
    );
    assert.equal(answered.isError, false);
    assert.equal(payloadOf(answered).nothing_to_activate, true);
  });

  it('a listed object that is no run reference is not counted', async () => {
    const { connection } = run(SILENT_RESULTS, LISTED);
    const answered = await handleActivateObject(
      { connection },
      { objects: OBJECTS },
    );
    assert.equal(answered.isError, false);
    assert.equal(payloadOf(answered).nothing_to_activate, true);
  });

  it('a read that fails: an error at step inactiveObjects, the outcome not decided', async () => {
    const { connection } = run(SILENT_RESULTS, 'refused');
    const answered = await handleActivateObject(
      { connection },
      { objects: GROUP_AND_PROGRAM },
    );
    assert.equal(answered.isError, true);
    const payload = payloadOf(answered);
    assert.equal(payload.step, 'inactiveObjects');
    assert.ok(
      typeof payload.message === 'string' &&
        payload.message.includes("activation's outcome could not be decided"),
    );
  });

  it('a 200 that is no inactive list: an error at step inactiveObjects, the outcome not decided', async () => {
    const { connection } = run(
      SILENT_RESULTS,
      '<html><body>Logon</body></html>',
    );
    const answered = await handleActivateObject(
      { connection },
      { objects: GROUP_AND_PROGRAM },
    );
    assert.equal(answered.isError, true);
    const payload = payloadOf(answered);
    assert.equal(payload.step, 'inactiveObjects');
    assert.ok(
      typeof payload.message === 'string' &&
        payload.message.includes('is no list of inactive objects'),
    );
  });

  for (const [_what, results] of [
    ['activationExecuted="true"', RESULTS.data],
    ['an E', REFUSED_RESULTS],
  ]) {
    it(format('results with %s: no read', _what), async () => {
      const { connection, requests } = run(results, LISTED);
      await handleActivateObject(
        { connection },
        { objects: GROUP_AND_PROGRAM },
      );
      assert.ok(!requests.includes(READ));
    });
  }
});
