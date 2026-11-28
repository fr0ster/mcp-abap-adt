/**
 * The envelope refusals (spec §7): each code answers its words — the fixed
 * ones as they are, the worded ones naming their number or tool — and the
 * failure reader knows each as the server's own.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENVELOPE_UNAVAILABLE_WORDS,
  ENVELOPES_UNAVAILABLE_WORDS,
  envelopeLimitWords,
  envelopeNodeStructureWords,
  envelopeNotRecordableWords,
  ServerRefusal,
  serverRefusalOf,
} from '../../../lib/auth/serverRefusal';

describe('the envelope refusals', () => {
  it('envelopes_unavailable and envelope_unavailable answer their fixed words', () => {
    assert.equal(
      new ServerRefusal('envelopes_unavailable').message,
      'this server instance keeps no envelopes',
    );
    assert.equal(
      ENVELOPES_UNAVAILABLE_WORDS,
      'this server instance keeps no envelopes',
    );
    assert.equal(
      new ServerRefusal('envelope_unavailable').message,
      'envelope is not available',
    );
    assert.equal(ENVELOPE_UNAVAILABLE_WORDS, 'envelope is not available');
  });

  it('envelope_limit names the bound', () => {
    assert.equal(
      envelopeLimitWords(3),
      '3 envelopes are open, the bound set by --batch-open-envelopes / openEnvelopes; execute or discard one first',
    );
    assert.equal(
      new ServerRefusal('envelope_limit', envelopeLimitWords(3)).message,
      envelopeLimitWords(3),
    );
  });

  it('envelope_not_recordable names the tool', () => {
    assert.equal(
      envelopeNotRecordableWords('GetTransport'),
      'GetTransport is not recorded into an envelope with these arguments; call it without envelope_handle',
    );
  });

  it('envelope_node_structure: with no earlier part, the refusal alone; with one, its number', () => {
    assert.equal(
      envelopeNodeStructureWords(undefined),
      'this envelope already holds a node structure read; record this one into another envelope',
    );
    assert.equal(
      envelopeNodeStructureWords(4),
      'this envelope already holds a node structure read; record this one into another envelope (the part recorded before it is sent at execution, under number 4)',
    );
  });

  it('the failure reader knows each as the server refusal it is', () => {
    const refusals = [
      new ServerRefusal('envelopes_unavailable'),
      new ServerRefusal('envelope_unavailable'),
      new ServerRefusal('envelope_limit', envelopeLimitWords(1)),
      new ServerRefusal(
        'envelope_not_recordable',
        envelopeNotRecordableWords('GetClass'),
      ),
      new ServerRefusal(
        'envelope_node_structure',
        envelopeNodeStructureWords(undefined),
      ),
    ];
    assert.deepStrictEqual(
      refusals.map((r) => serverRefusalOf(r)?.code),
      [
        'envelopes_unavailable',
        'envelope_unavailable',
        'envelope_limit',
        'envelope_not_recordable',
        'envelope_node_structure',
      ],
    );
  });
});
