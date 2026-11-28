/**
 * `stepOutcome` (#394, spec §1): one outcome per call, from typed fields
 * only. Each row of the spec's table, a success that carries a failed
 * release, and a thrown value of each kind.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolResultLike } from '../../../lib/toolResult';
import {
  answerOutcome,
  outcomeOf,
  thrownOutcome,
} from '../../integration/helpers/stepOutcome';

const json = (payload: unknown, isError: boolean): ToolResultLike => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

describe('answerOutcome', () => {
  it('ok: a success, a terse success, a success with no cleanup', () => {
    assert.equal(
      answerOutcome({ content: [{ type: 'text', text: 'SUCCESS' }] }),
      'ok',
    );
    assert.equal(answerOutcome(json({ result: 'x' }, false)), 'ok');
  });

  it('credential: an authentication failure, a 401', () => {
    assert.equal(
      answerOutcome(
        json(
          { error: 'authentication_failed', kind: 'credential-refused' },
          true,
        ),
      ),
      'credential',
    );
    assert.equal(
      answerOutcome(
        json({ message: 'x', origin: 'refusal', status: 401 }, true),
      ),
      'credential',
    );
  });

  it('session-lost: session_lost, or session_error that ends the session, anywhere', () => {
    assert.equal(
      answerOutcome(
        json(
          {
            message: 'x',
            origin: 'refusal',
            status: 400,
            session_lost: 'ADT_SESSION_REPLACED',
          },
          true,
        ),
      ),
      'session-lost',
    );
    assert.equal(
      answerOutcome(
        json(
          {
            error: 'client_threw',
            message: 'x',
            session_error: 'ADT_NOT_CONNECTED',
          },
          true,
        ),
      ),
      'session-lost',
    );
    assert.equal(
      answerOutcome(
        json(
          {
            message: 'x',
            origin: 'connection',
            failures: [{ session_error: 'ADT_SESSION_REPLACED' }],
          },
          true,
        ),
      ),
      'session-lost',
    );
  });

  it('network: connection_cause on the answer or an entry', () => {
    assert.equal(
      answerOutcome(
        json(
          {
            message: 'x',
            origin: 'connection',
            connection_cause: 'ECONNREFUSED',
          },
          true,
        ),
      ),
      'network',
    );
    assert.equal(
      answerOutcome(
        json(
          {
            message: 'x',
            origin: 'connection',
            cleanup: { failures: [{ connection_cause: 'ECONNRESET' }] },
          },
          true,
        ),
      ),
      'network',
    );
  });

  it('refused: SAP answered — an integer status, or a refusal by origin', () => {
    assert.equal(
      answerOutcome(json({ message: 'locked', origin: 'refusal' }, true)),
      'refused',
    );
    assert.equal(
      answerOutcome(json({ message: 'x', status: 409 }, true)),
      'refused',
    );
  });

  it('unclassified: a failure whose fields do not say who answered', () => {
    assert.equal(
      answerOutcome(json({ error: 'client_threw', message: 'x' }, true)),
      'unclassified',
    );
    assert.equal(
      answerOutcome(json({ message: 'x', origin: 'connection' }, true)),
      'unclassified',
    );
    assert.equal(
      answerOutcome({
        isError: true,
        content: [{ type: 'text', text: 'not json' }],
      }),
      'unclassified',
    );
  });

  it('a released session error (ADT_RELEASE_PENDING) is not a lost session', () => {
    assert.equal(
      answerOutcome(
        json(
          {
            error: 'client_threw',
            message: 'x',
            session_error: 'ADT_RELEASE_PENDING',
          },
          true,
        ),
      ),
      'unclassified',
    );
  });

  it('words never decide: a message naming a network code is not network', () => {
    assert.equal(
      answerOutcome(
        json(
          { message: 'The request failed: ECONNREFUSED', origin: 'connection' },
          true,
        ),
      ),
      'unclassified',
    );
  });

  describe('a success that carries a failed release', () => {
    const carrying = (cleanup: unknown) =>
      json({ result: 'SUCCESS', cleanup }, false);

    it('a release cut on the network is network', () => {
      assert.equal(
        answerOutcome(
          carrying({
            left_locked: true,
            lock_handle: 'H',
            failures: [{ connection_cause: 'ECONNREFUSED', step: 'unlock' }],
          }),
        ),
        'network',
      );
    });

    it('a release in a lost session is session-lost', () => {
      assert.equal(
        answerOutcome(
          carrying({
            left_locked: true,
            failures: [{ session_error: 'ADT_NOT_CONNECTED' }],
          }),
        ),
        'session-lost',
      );
    });

    it('a release SAP refused is ok', () => {
      assert.equal(
        answerOutcome(
          carrying({
            left_locked: true,
            lock_handle: 'H',
            failures: [{ status: 423, origin: 'refusal' }],
          }),
        ),
        'ok',
      );
    });

    it('a release that threw with nothing typed is unclassified', () => {
      assert.equal(
        answerOutcome(
          carrying({
            error: 'client_threw',
            left_locked: true,
            failures: [{ error: 'client_threw' }],
          }),
        ),
        'unclassified',
      );
    });

    it('a cleanup without left_locked (the lock went with its session) is ok', () => {
      assert.equal(
        answerOutcome(
          carrying({ warning: 'x', object: { type: 'CLAS', name: 'Z' } }),
        ),
        'ok',
      );
    });
  });
});

describe('thrownOutcome', () => {
  const thrown = (fields: Record<string, unknown>) =>
    Object.assign(new Error('x'), fields);

  it('each kind of thrown value', () => {
    assert.equal(thrownOutcome(thrown({ code: 'ECONNRESET' })), 'network');
    assert.equal(
      thrownOutcome(thrown({ code: 'ADT_SESSION_REPLACED' })),
      'session-lost',
    );
    assert.equal(
      thrownOutcome(thrown({ sessionLost: 'ADT_SESSION_REPLACED' })),
      'session-lost',
    );
    assert.equal(
      thrownOutcome(thrown({ response: { status: 500 } })),
      'refused',
    );
    assert.equal(thrownOutcome(new Error('plain')), 'unclassified');
    assert.equal(thrownOutcome('a string'), 'unclassified');
  });

  it('a throwing getter is read as absent', () => {
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'code', {
      get() {
        throw new Error('getter');
      },
    });
    assert.equal(thrownOutcome(hostile), 'unclassified');
  });
});

describe('outcomeOf', () => {
  it('an answer and a throw', async () => {
    const answered = await outcomeOf(async () => json({ result: 1 }, false));
    assert.equal(answered.outcome, 'ok');
    const threw = await outcomeOf(async (): Promise<ToolResultLike> => {
      throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' });
    });
    assert.equal(threw.outcome, 'network');
  });
});
