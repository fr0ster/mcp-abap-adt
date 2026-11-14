/**
 * A call recorded in a communication batch reaches its handler through the
 * batch's recorder: the recorder keeps the system kind the server states
 * for the call's connection (`systemType`), with `SAP_SYSTEM_TYPE` unset —
 * as on an HTTP/SSE server or in an embedder. Only `createAbapConnection`
 * is a fake here; `systemKindOf` is the real one.
 */
jest.mock('../../../lib/connectionFactory', () => ({
  ...jest.requireActual('../../../lib/connectionFactory'),
  createAbapConnection: jest.fn(),
}));

import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand } from '../../helpers/batchStand';
import { withinTurns } from '../../helpers/withinTurns';

function sap(inner: InnerRequest): PartAnswer {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    body: `source of ${inner.url}`,
  };
}

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SAP_SYSTEM_TYPE;
  delete process.env.SAP_SYSTEM_TYPE;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

it('a recorded read runs on the kind the server states, not SAP_SYSTEM_TYPE', async () => {
  const stand = await batchStand({ tools: ['GetProgram'], part: sap });
  try {
    stand.begin();
    const recorded = await withinTurns(
      stand.call('GetProgram', { program_name: 'PROG_A' }),
    );
    expect(recorded.isError).toBeFalsy();
    const { summary } = await withinTurns(stand.end());
    expect(summary).toEqual({ received: 1, recorded: 1, sent: 1 });
    const [entry] = await withinTurns(stand.answers([1]));
    expect(JSON.stringify(entry)).toContain('source of');
    expect(JSON.stringify(entry)).not.toContain('system_type_required');
  } finally {
    await stand.close();
  }
});
