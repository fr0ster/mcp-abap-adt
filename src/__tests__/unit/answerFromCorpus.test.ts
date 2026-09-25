import * as fs from 'node:fs';
import * as path from 'node:path';
import { readAdtRefusal } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { ADT_CORPUS_DIR, corpusBody, corpusSidecar } from '../../lib/adtCorpus';
import { return_answer } from '../../lib/answer';

/**
 * The two halves composed, against documents SAP actually sent.
 *
 * Everything else tests one side: the readings against fixtures, the adapter
 * against fabricated errors. This is the join — a real document goes in, a
 * strategy reads it, the adapter decides what a caller may see. It is where a
 * field that survives the reading and is dropped by the allowlist would show.
 */

/** A failure as a strategy would hand it over, from a real document. */
function failureFrom(name: string): IAdtResponse<never, IAdtError> {
  const meta = corpusSidecar(name);
  const document = corpusBody(name);
  const refusal = readAdtRefusal(document);
  if (!refusal) throw new Error(`${name} was not read as a refusal`);
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => ({
      origin: 'refusal',
      message: refusal.message,
      adtType: refusal.adtType,
      namespace: refusal.namespace,
      messages: refusal.messages,
      // Deliberately wider than the contract, the way a strategy might.
      request: {
        method: meta.request.method,
        url: meta.request.url,
        headers: { authorization: 'Bearer MUST-NOT-APPEAR' },
      },
      response: { data: document },
    }),
  } as unknown as IAdtResponse<never, IAdtError>;
}

const REFUSALS = [
  'refusal-write-not-locked--01-update-source',
  'refusal-object-not-found--01-read-source',
  'refusal-lock-held-by-other--01-lock',
  'refusal-activation-fails--01-activation',
  'refusal-syntax-check--01-checkrun',
  'refusal-check-nonexistent-object--01-checkrun',
  'refusal-delete-refused--01-deletion-delete',
  'refusal-validation-name-taken-ddl--01-ddl-validation',
];

describe('a real refusal, read and then answered', () => {
  it.each(REFUSALS)('%s comes back as an error with a sentence', (name) => {
    const result = return_answer(failureFrom(name), (v) => v, {
      tool: 'AnyTool',
      detail: 'terse',
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.origin).toBe('refusal');
    expect(typeof payload.message).toBe('string');
    expect(payload.message.length).toBeGreaterThan(0);
    expect(payload.messages.length).toBeGreaterThan(0);
    expect(['E', 'W', 'I', 'S']).toContain(payload.messages[0].type);
  });

  it.each(REFUSALS)(
    '%s never leaks a credential the strategy attached',
    (name) => {
      for (const detail of ['terse', 'full', 'raw'] as const) {
        const text = return_answer(failureFrom(name), (v) => v, {
          tool: 'AnyTool',
          detail,
        }).content[0].text;
        expect(text).not.toContain('Bearer');
        expect(text).not.toContain('authorization');
      }
    },
  );

  it('keeps the T100 key where the document had one', () => {
    const payload = JSON.parse(
      return_answer(
        failureFrom('refusal-write-not-locked--01-update-source'),
        (v) => v,
        { tool: 'UpdateClass', detail: 'terse' },
      ).content[0].text,
    );

    expect(payload.messages[0].t100).toEqual({
      id: 'SADT_RESOURCE',
      no: '026',
      values: ['CLASS', 'ZMCP_BLD_ANSCH01', 'ZZ_INVALID_LOCK_HANDLE_0001'],
    });
  });

  it('omits the key where the carrier never had one, without inventing it', () => {
    const payload = JSON.parse(
      return_answer(
        failureFrom('refusal-delete-refused--01-deletion-delete'),
        (v) => v,
        { tool: 'DeleteClass', detail: 'terse' },
      ).content[0].text,
    );

    expect(payload.messages[0].t100).toBeUndefined();
    expect(payload.messages[0].text).toContain('already editing');
  });

  it('gives the document back at every detail, not only raw', () => {
    // The real refusal document, character for character, whatever `detail`
    // the caller asked for. `detail` selects between the layers of a reading
    // on the SUCCESS path; on this one the consumer wants everything, and a
    // tool that declares no `detail` must still be able to see what SAP sent.
    const name = 'refusal-activation-fails--01-activation';

    for (const detail of ['terse', 'full', 'raw'] as const) {
      const payload = JSON.parse(
        return_answer(failureFrom(name), (v) => v, {
          tool: 'ActivateClass',
          detail,
        }).content[0].text,
      );
      expect(payload.raw_body).toBe(corpusBody(name));
    }
  });
});
