/**
 * An envelope's execution (spec §6), recorded through the recorder over the
 * envelope directly (the dispatch is `envelopeRecording.test.ts`'s), at a
 * fake connection that counts envelopes:
 *
 * - one ADT envelope by default; under the consumer's bound, `packByParts`
 *   envelopes in recording order; a call over the bound sends nothing and
 *   every number answers the oversized words;
 * - a part's `404` answers that number only; a failed run answers every
 *   number it carried with the failure itself, whatever its handler would
 *   make of it; the first failed run (or a `401` part) ends the sending,
 *   the earlier runs' answers kept — their handlers never aborted — and the
 *   unsent numbers answer that failure;
 * - no `406`/`415` resend; `keepRawParts` adds `raw`; a resumed handler
 *   that would send more answers `batch_ended`; an empty envelope answers
 *   `[]`, sending nothing;
 * - executed once: the claim ends the envelope, a second execute, a discard
 *   and a record after it answer `envelope_unavailable`, one send; the
 *   execute answers `isError: false` once past the claim.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../../handlers/interfaces';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import { createBatchAvailability } from '../../../lib/batch/availability';
import {
  envelopeTarget,
  executeEnvelope,
  executeEnvelopeTool,
  recordOf,
} from '../../../lib/batch/envelopeTools';
import type { BatchAnswer, RawPart } from '../../../lib/batch/InstanceBatch';
import {
  type Envelope,
  InstanceEnvelopes,
} from '../../../lib/batch/InstanceEnvelopes';
import { createRecorder } from '../../../lib/batch/recorder';
import { return_error } from '../../../lib/utils';
import {
  type EnvelopeAnswer,
  envelopeConnection,
  envelopeResponse,
  type InnerRequest,
  type PartAnswer,
  statusError,
} from '../../helpers/batchEnvelope';
import { withinTurns } from '../../helpers/withinTurns';

const KEY = { context: {} };

/** Answers each part 200 with its URL, but `override` where it names one. */
const byUrl =
  (
    override: (inner: InnerRequest) => PartAnswer | undefined = () => undefined,
  ): EnvelopeAnswer =>
  (parts) =>
    envelopeResponse(
      parts.map(
        (p) => override(p) ?? { status: 200, statusText: 'OK', body: p.url },
      ),
    );

const textOf = (answer: BatchAnswer | undefined) =>
  answer?.content.map((c) => ('text' in c ? c.text : '')).join('') ?? '';

/**
 * Records one call of `handler` into `envelope`: its recorder over the
 * envelope's target, its number's answer the handler's text — or, when it
 * throws, its failure as a tool answers it.
 */
function record(
  envelope: Envelope,
  handler: (c: IAbapConnection) => Promise<string>,
  options: { keepRawParts?: boolean; aborted?: () => void } = {},
) {
  const controller = envelope.callSignal();
  controller.signal.addEventListener('abort', () => options.aborted?.());
  const target = envelopeTarget(
    envelope,
    controller.signal,
    options.keepRawParts === true,
  );
  let running: Promise<string> = Promise.resolve('');
  const recorder = createRecorder(
    target,
    (n) => {
      recordOf(envelope).calls.push({
        number: n,
        resume: async (): Promise<BatchAnswer> => {
          recorder.release();
          const raw: RawPart[] | undefined =
            options.keepRawParts === true ? recorder.rawParts() : undefined;
          try {
            const text = await running;
            return {
              number: n,
              content: [{ type: 'text', text }],
              ...(raw !== undefined ? { raw } : {}),
            };
          } catch (error) {
            return {
              number: n,
              content: return_error(error).content,
              isError: true,
              ...(raw !== undefined ? { raw } : {}),
            };
          }
        },
        letGo: () => controller.abort(),
        refusal: () => recorder.otherKind(),
      });
    },
    'GetClass',
  );
  running = handler(recorder);
  running.catch(() => undefined);
  return recorder;
}

/** One GET of `url`; its body the answer. */
const get = (url: string) => async (c: IAbapConnection) =>
  String((await c.makeAdtRequest({ url, method: 'GET', timeout: 0 })).data);

function stand(answer: EnvelopeAnswer, partsPerEnvelope?: number) {
  const fake = envelopeConnection(answer);
  const owner = new InstanceEnvelopes({ keepRawParts: false });
  const context: HandlerContext = {
    connection: fake.connection,
    logger: undefined,
    batchAvailability: createBatchAvailability(),
    envelopes: owner,
    envelopeKey: () => KEY,
    ...(partsPerEnvelope !== undefined && { partsPerEnvelope }),
  };
  const envelope = owner.create(KEY);
  const run = async () => {
    owner.claim(envelope.handle, KEY);
    return withinTurns(executeEnvelope(context, envelope), 2000);
  };
  return { fake, owner, context, envelope, run };
}

describe('executing an envelope', () => {
  it('one ADT envelope by default, every number answered in recording order', async () => {
    const s = stand(byUrl());
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    record(s.envelope, get('/c'));
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 1);
    assert.deepStrictEqual(
      answers.map((a) => [a.number, textOf(a)]),
      [
        [1, '/a'],
        [2, '/b'],
        [3, '/c'],
      ],
    );
  });

  it("under the consumer's bound: packByParts envelopes, in recording order", async () => {
    const s = stand(byUrl(), 2);
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    record(s.envelope, get('/c'));
    const answers = await s.run();
    assert.deepStrictEqual(
      s.fake.envelopes.map((e) => e.parts.map((p) => p.url)),
      [['/a', '/b'], ['/c']],
    );
    assert.deepStrictEqual(answers.map(textOf), ['/a', '/b', '/c']);
  });

  it('a call needing more parts than the bound: nothing is sent, every number answers the oversized words', async () => {
    const s = stand(byUrl(), 2);
    record(s.envelope, get('/a'));
    record(s.envelope, async (c) => {
      const three = ['/x', '/y', '/z'].map((url) =>
        c.makeAdtRequest({ url, method: 'GET', timeout: 0 }),
      );
      return (await Promise.all(three)).map((r) => String(r.data)).join();
    });
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 0);
    assert.equal(answers.length, 2);
    for (const answer of answers) {
      assert.equal(answer.isError, true);
      assert.match(
        textOf(answer),
        /needs 3 parts in one ADT batch envelope, more than the 2 parts/,
      );
    }
  });

  it("a part's 404 answers that number only", async () => {
    const s = stand(
      byUrl((p) =>
        p.url === '/b'
          ? { status: 404, statusText: 'Not Found', body: 'absent' }
          : undefined,
      ),
    );
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    record(s.envelope, get('/c'));
    const answers = await s.run();
    assert.deepStrictEqual(
      answers.map((a) => a.isError === true),
      [false, true, false],
    );
  });

  it('a failed envelope answers every number it carried with the failure itself, even where the handler would catch it', async () => {
    const s = stand(() => {
      throw statusError(500, 'Internal Server Error', 'refused');
    });
    record(s.envelope, get('/a'));
    record(s.envelope, async (c) => {
      try {
        return await get('/b')(c);
      } catch {
        return 'caught';
      }
    });
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 1);
    for (const answer of answers) {
      assert.equal(answer.isError, true);
      assert.notEqual(textOf(answer), 'caught');
      assert.match(textOf(answer), /500/);
    }
    assert.equal(textOf(answers[0]), textOf(answers[1]));
  });

  it('a credential refusal of the envelope answers every number as the failure reader does', async () => {
    const refusal = new AuthProviderFailure(
      authError['credential-refused']({ credential: 'token' }),
    );
    const s = stand(() => {
      throw refusal;
    });
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    const answers = await s.run();
    for (const answer of answers) assert.equal(answer.isError, true);
    assert.equal(textOf(answers[0]), textOf(answers[1]));
    assert.equal(textOf(answers[0]), return_error(refusal).content[0]?.text);
  });

  it('a failure in the second of three runs: the first run answered (its slow handler never aborted), no third sent, the unsent numbers answer the failure', async () => {
    let count = 0;
    const s = stand((parts) => {
      count += 1;
      if (count === 2) throw statusError(503, 'Service Unavailable');
      return byUrl()(parts, {
        url: '',
        accept: undefined,
        session: 'stateless',
        parts,
      });
    }, 1);
    let firstAborted = false;
    record(
      s.envelope,
      async (c) => {
        const text = await get('/a')(c);
        for (let i = 0; i < 50; i += 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        return text;
      },
      { aborted: () => (firstAborted = true) },
    );
    record(s.envelope, get('/b'));
    record(s.envelope, get('/c'));
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 2);
    assert.equal(textOf(answers[0]), '/a');
    assert.equal(answers[0]?.isError, undefined);
    assert.equal(firstAborted, false);
    assert.equal(answers[1]?.isError, true);
    assert.equal(answers[2]?.isError, true);
    assert.equal(textOf(answers[1]), textOf(answers[2]));
  });

  it('a part SAP answered 401 ends the sending: no later envelope', async () => {
    const s = stand(
      byUrl((p) =>
        p.url === '/a'
          ? { status: 401, statusText: 'Unauthorized' }
          : undefined,
      ),
      1,
    );
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 1);
    assert.equal(answers[1]?.isError, true);
  });

  it('a part answered 406 is not corrected and sent again', async () => {
    const s = stand(
      byUrl((p) =>
        p.url === '/a'
          ? {
              status: 406,
              statusText: 'Not Acceptable',
              headers: { accept: 'application/vnd.sap.adt.placeholder+xml' },
            }
          : undefined,
      ),
    );
    record(s.envelope, get('/a'));
    const answers = await s.run();
    assert.equal(s.fake.envelopes.length, 1);
    assert.equal(s.fake.directs.length, 0);
    assert.equal(answers[0]?.isError, true);
  });

  it('keepRawParts: each answer carries its raw parts', async () => {
    const s = stand(byUrl());
    record(s.envelope, get('/a'), { keepRawParts: true });
    const answers = await s.run();
    assert.deepStrictEqual(
      answers[0]?.raw?.map((r) => [r.status, r.body]),
      [[200, '/a']],
    );
  });

  it('a resumed handler that would send a request built from an answer answers batch_not_recordable', async () => {
    const s = stand(byUrl());
    record(s.envelope, async (c) => {
      await get('/a')(c);
      return get('/again')(c);
    });
    const answers = await s.run();
    assert.equal(answers[0]?.isError, true);
    assert.match(textOf(answers[0]), /"error":"batch_not_recordable"/);
    assert.match(
      textOf(answers[0]),
      /GetClass sends a request built from another's answer, which an envelope cannot record: call it without envelope_handle/,
    );
    assert.equal(s.fake.envelopes.length, 1);
  });

  it('an empty envelope answers [] and sends nothing', async () => {
    const s = stand(byUrl());
    assert.deepStrictEqual(await s.run(), []);
    assert.equal(s.fake.calls.makeAdtRequest.length, 0);
  });

  it('once only: a second execute, a discard and a record after execute answer envelope_unavailable, one send; the execute is no error', async () => {
    const s = stand(
      byUrl((p) => (p.url === '/b' ? { status: 404 } : undefined)),
    );
    record(s.envelope, get('/a'));
    record(s.envelope, get('/b'));
    const first = await withinTurns(
      executeEnvelopeTool(s.context, s.envelope.handle),
      2000,
    );
    assert.equal(first.isError, false);
    const answers = JSON.parse(first.content[0]?.text ?? '[]') as BatchAnswer[];
    assert.equal(answers.length, 2);
    assert.equal(answers[1]?.isError, true);
    const refused = (act: () => unknown) => {
      try {
        act();
      } catch (error) {
        return error instanceof ServerRefusal ? error.serverRefusal : 'other';
      }
      return 'none';
    };
    await assert.rejects(
      executeEnvelopeTool(s.context, s.envelope.handle),
      (error: unknown) =>
        error instanceof ServerRefusal &&
        error.serverRefusal === 'envelope_unavailable',
    );
    assert.equal(
      refused(() => s.owner.discard(s.envelope.handle, KEY)),
      'envelope_unavailable',
    );
    assert.equal(
      refused(() => s.owner.find(s.envelope.handle, KEY)),
      'envelope_unavailable',
    );
    assert.equal(s.fake.envelopes.length, 1);
  });

  it('execution goes stateless while the connection is stateful', async () => {
    const s = stand(byUrl());
    s.fake.connection.setSessionType('stateful');
    record(s.envelope, get('/a'));
    await s.run();
    assert.equal(s.fake.envelopes[0]?.session, 'stateless');
  });
});
