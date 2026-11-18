/**
 * The connection's own words for a session it lost or never had — its
 * session error codes `ADT_SESSION_REPLACED`, `ADT_NOT_CONNECTED`,
 * `ADT_RELEASE_PENDING` — never reach the consumer (the owner, 2026-11-18):
 * the answer carries fixed server words and the code, the original goes to
 * the log at `debug`. Told by the code, never by the words. One case per
 * path a connection failure reaches an answer by.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import {
  answerRequestThrown,
  answerThrown,
  failureEntry,
  requestErrorOf,
  thrownEntry,
} from '../../lib/answer';
import { logger } from '../../lib/logger';
import { sessionEndWords } from '../../lib/sessionEnd';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { return_error } from '../../lib/utils';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/** The connection's prose for each code (its own words, abbreviated). */
const PROSE = {
  [ADT_SESSION_ERROR.SESSION_REPLACED]:
    'The SAP session this connection was using is gone and the requests are now on a different one. What to do about it is yours. Nothing is retried here.',
  [ADT_SESSION_ERROR.NOT_CONNECTED]:
    'The session this request was admitted to is gone; nothing was sent',
  [ADT_SESSION_ERROR.RELEASE_PENDING]:
    'A release of this connection is pending; the connection prose',
} as const;

type Code = keyof typeof PROSE;

/** What the connection throws: its words, its code. */
function sessionThrown(code: Code) {
  return Object.assign(new Error(PROSE[code]), { code });
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

/** The fixed words and the code, and no connector prose anywhere. */
function expectFixed(
  payload: Record<string, unknown>,
  code: Code,
  step?: string,
) {
  expect(payload.message).toBe(sessionEndWords(code, step));
  expect(payload.session_error).toBe(code);
  const text = JSON.stringify(payload);
  for (const prose of Object.values(PROSE)) {
    expect(text).not.toContain(prose);
  }
  expect(text).not.toContain('Nothing is retried');
}

const CODES: Code[] = [
  ADT_SESSION_ERROR.SESSION_REPLACED,
  ADT_SESSION_ERROR.NOT_CONNECTED,
  ADT_SESSION_ERROR.RELEASE_PENDING,
];

const SENT = { method: 'POST', url: '/sap/bc/adt/checkruns' };

describe("the connection's session words never reach the answer", () => {
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

  it.each(CODES)(
    "%s: a tool's failure (CheckClassLow), the original logged at debug",
    async (code) => {
      const debug = jest.spyOn(logger, 'debug');
      const connection = throwing(() => sessionThrown(code));
      declareSystemKind(connection, 'onprem');
      const answered = await handleCheckClass(
        { connection },
        { class_name: 'ZCL_A' },
      );
      expect(answered.isError).toBe(true);
      expectFixed(payloadOf(answered), code);
      expect(JSON.stringify(debug.mock.calls)).toContain(PROSE[code]);
    },
  );

  it.each(CODES)(
    "%s: a batch item's entry (failureEntry), with its step",
    (code) => {
      const entry = failureEntry(
        requestErrorOf(sessionThrown(code), SENT),
        'write',
      );
      expectFixed(entry, code, 'write');
      expect(entry.step).toBe('write');
    },
  );

  it.each(CODES)(
    '%s: a throw (thrownEntry, answerRequestThrown, answerThrown, return_error)',
    (code) => {
      expectFixed(thrownEntry(sessionThrown(code), 'write'), code, 'write');
      expectFixed(
        payloadOf(answerRequestThrown(sessionThrown(code), SENT, 'write')),
        code,
        'write',
      );
      expectFixed(
        payloadOf(
          answerThrown(sessionThrown(code), { tool: 'T', detail: 'terse' }),
        ),
        code,
      );
      expectFixed(payloadOf(return_error(sessionThrown(code))), code);
    },
  );

  it('the session SAP replaced after a step ran names that step', () => {
    expect(
      sessionEndWords(ADT_SESSION_ERROR.SESSION_REPLACED, 'write'),
    ).toContain('write');
  });

  it('a connection failure with no session code keeps its words', () => {
    const plain = Object.assign(new Error('The request failed: ECONNRESET'), {
      code: 'ECONNRESET',
    });
    expect(thrownEntry(plain, 'write').message).toBe(
      'The request failed: ECONNRESET',
    );
  });
});
