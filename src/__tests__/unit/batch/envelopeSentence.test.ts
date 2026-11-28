/**
 * The envelope sentence a core tool's description ends with (spec §5.1):
 * from its core entries alone — the always form for an entry that admits
 * every call, the "When …" form, its arguments in the table's words, for
 * entries that admit some; none for a tool no core entry names. The
 * compact batch sentence reads compact entries alone.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BatchEntry } from '../../../lib/batch/eligibility';
import {
  batchSentence,
  ENVELOPE_SENTENCE,
  envelopeSentence,
  envelopeSentenceOf,
  OUTSIDE_BATCH_SENTENCE,
  RECORDABLE_SENTENCE,
} from '../../../lib/batch/sentence';

const row = (when?: BatchEntry['when']): BatchEntry => ({
  tool: 'GetFunctionModule',
  set: 'core',
  handler:
    'src/handlers/function_module/high/handleGetFunctionModule.ts#handleGetFunctionModule',
  sends: 'one request: GET the metadata document',
  ...(when !== undefined ? { when } : {}),
});

describe('the envelope sentence', () => {
  it('an entry with no when: the always form', () => {
    assert.equal(envelopeSentenceOf([row()]), ENVELOPE_SENTENCE);
  });

  it('entries with a when: the When form, in the words of the table', () => {
    assert.equal(
      envelopeSentenceOf([row([{ argument: 'part', equals: ['metadata'] }])]),
      'When part is metadata, with envelope_handle, the call is recorded into that envelope under the next number, and its answer comes back when the envelope is executed.',
    );
  });

  it('no core entry: no sentence', () => {
    assert.equal(envelopeSentenceOf([]), undefined);
    assert.equal(envelopeSentence('HandlerProfileList'), undefined);
  });

  it("the compact sentences are unchanged: a compact entry's tool keeps its sentence, a core-only tool none", () => {
    assert.equal(batchSentence('HandlerProfileList'), RECORDABLE_SENTENCE);
    assert.equal(batchSentence('GetClass'), OUTSIDE_BATCH_SENTENCE);
  });
});
