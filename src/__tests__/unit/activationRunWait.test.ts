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
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

const RUN_ID = 'RUN0001';
const RUNS = 'xmlns:runs="http://www.sap.com/adt/activation/runs"';

const STARTED = {
  status: 202,
  headers: { location: `/sap/bc/adt/activation/runs/${RUN_ID}` },
};
/** A status read while the run goes on: a progress value, not terminal. */
const RUNNING = {
  data: `<?xml version="1.0" encoding="utf-8"?><runs:run ${RUNS} runs:status="40"/>`,
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
    jest.useRealTimers();
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
    expect(answered.isError).toBe(false);
    const reads = connection.requests
      .slice(1)
      .map((request) => `${request.method} ${request.url}`);
    expect(reads).toEqual([
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${STATUS_URL}`,
      `GET ${RESULTS_URL}`,
    ]);
  });

  it('no timer runs between reads', async () => {
    jest.useFakeTimers();
    const connection = runAnswering(3);
    const pendingAtReads: number[] = [];
    const answer = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = (options) => {
      pendingAtReads.push(jest.getTimerCount());
      return answer(options);
    };
    // The wait completes without the fake clock being advanced.
    const answered = await handleActivateObject(
      { connection },
      { objects: OBJECTS },
    );
    expect(answered.isError).toBe(false);
    expect(connection.requests).toHaveLength(6);
    expect(pendingAtReads).toEqual([0, 0, 0, 0, 0, 0]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a run past six reads is still waited for', async () => {
    const connection = runAnswering(7);
    const payload = payloadOf(
      await handleActivateObject({ connection }, { objects: OBJECTS }),
    );
    expect(payload.run_status).toBe('finished');
    expect(payload.activated).toBe(true);
    const urls = connection.requests.map((request) => request.url);
    expect(urls.filter((url) => url === STATUS_URL)).toHaveLength(8);
    expect(urls.at(-1)).toBe(RESULTS_URL);
  });
});
