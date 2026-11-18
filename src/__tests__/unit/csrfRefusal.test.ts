/**
 * A request SAP refused for its session token — `403` with the header
 * `x-csrf-token: Required` — is answered in fixed words with status 403:
 * none of SAP's words, no `raw_body`, no messages (the owner, 2026-11-18;
 * the words misled the consumer). The connection fetched a new token and sent
 * the request once more before this answer; SAP checks the token before it
 * processes the request, so nothing ran. The original is logged at `debug`.
 * A `403` without that header (an authorization refusal) is answered as
 * before. One case per path a refusal reaches an answer by.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { handleListTransports } from '../../handlers/transport/readonly/handleListTransports';
import {
  answerRequestThrown,
  answerThrown,
  failureEntry,
  requestErrorOf,
  thrownEntry,
} from '../../lib/answer';
import { CSRF_REFUSAL_WORDS } from '../../lib/csrfRefusal';
import { logger } from '../../lib/logger';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { statusError } from '../helpers/batchEnvelope';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/** SAP's own words and page for the refusal, as ICF answers it. */
const SAP_WORDS = 'CSRF token validation failed';

/** The ICF refusal: `403`, `x-csrf-token: Required`, SAP's words as the body. */
function csrfThrown() {
  return statusError(403, 'Forbidden', SAP_WORDS, {
    'X-CSRF-Token': 'Required',
    'content-type': 'text/plain; charset=utf-8',
  });
}

/** An authorization refusal: `403`, no session-token header. */
function forbiddenThrown() {
  return statusError(403, 'Forbidden', 'No authorization for the object', {
    'content-type': 'text/plain; charset=utf-8',
  });
}

/** A connection whose every ADT request throws `thrown()`. */
function throwing(thrown: () => Error): IAbapConnection {
  const inner = recordingConnection();
  return {
    ...inner,
    makeAdtRequest: async () => {
      throw thrown();
    },
  };
}

/** An answer's JSON payload. */
function payloadOf(answered: { content?: Array<{ text?: string }> }) {
  const [first] = answered.content ?? [];
  return JSON.parse(first?.text ?? 'null');
}

/** The fixed answer, and none of SAP's words anywhere in it. */
function expectFixed(payload: Record<string, unknown>) {
  expect(payload.message).toBe(CSRF_REFUSAL_WORDS);
  expect(payload.status).toBe(403);
  expect(payload).not.toHaveProperty('raw_body');
  expect(payload).not.toHaveProperty('messages');
  expect(JSON.stringify(payload)).not.toContain(SAP_WORDS);
}

const SENT = { method: 'POST', url: '/sap/bc/adt/checkruns' };

describe('a refusal of the session token is answered in fixed words', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  it("a tool's refusal (CheckClassLow), the original logged at debug", async () => {
    const debug = jest.spyOn(logger, 'debug');
    const connection = throwing(csrfThrown);
    declareSystemKind(connection, 'onprem');
    const answered = await handleCheckClass(
      { connection },
      { class_name: 'ZCL_A', detail: 'raw' },
    );
    expect(answered.isError).toBe(true);
    expectFixed(payloadOf(answered));
    const logged = JSON.stringify(debug.mock.calls);
    expect(logged).toContain(SAP_WORDS);
    expect(logged).toContain('403');
    expect(logged).not.toContain('Required');
  });

  it('a long read (ListTransports), the answer a background run keeps', async () => {
    const connection = throwing(csrfThrown);
    declareSystemKind(connection, 'onprem');
    const answered = await handleListTransports(
      { connection },
      { user: 'USER_A' },
    );
    expect(answered.isError).toBe(true);
    expectFixed(payloadOf(answered));
  });

  it("a batch item's entry (failureEntry)", () => {
    const entry = failureEntry(requestErrorOf(csrfThrown(), SENT), 'check');
    expectFixed(entry);
    expect(entry.step).toBe('check');
  });

  it("a thrown request's entry (thrownEntry) and answer (answerRequestThrown)", () => {
    expectFixed(thrownEntry(csrfThrown(), 'check'));
    expectFixed(payloadOf(answerRequestThrown(csrfThrown(), SENT, 'check')));
  });

  it('a throw no strategy read (answerThrown)', () => {
    expectFixed(
      payloadOf(answerThrown(csrfThrown(), { tool: 'T', detail: 'terse' })),
    );
  });

  it('a 403 without the header is answered as before, with SAP words', async () => {
    const connection = throwing(forbiddenThrown);
    declareSystemKind(connection, 'onprem');
    const answered = await handleCheckClass(
      { connection },
      { class_name: 'ZCL_A' },
    );
    const payload = payloadOf(answered);
    expect(payload.status).toBe(403);
    expect(payload.message).not.toBe(CSRF_REFUSAL_WORDS);
    expect(JSON.stringify(payload)).toContain(
      'No authorization for the object',
    );
    const entry = thrownEntry(forbiddenThrown(), 'check');
    expect(entry.message).not.toBe(CSRF_REFUSAL_WORDS);
  });
});
