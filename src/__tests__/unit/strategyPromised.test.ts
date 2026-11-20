import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  answerRead,
  readingFor,
  writeProjection,
  writeReading,
} from '../../lib/strategies/promised';
import { corpusBody, corpusSidecar } from '../helpers/adtCorpus';

function wire(name: string): IAdtWireResponse {
  const meta = corpusSidecar(name);
  return {
    status: Number(meta.response.status),
    headers: meta.response.headers,
    data: corpusBody(name),
  } as unknown as IAdtWireResponse;
}

describe('a read gives back what the tool promised', () => {
  it('class source was promised as text, so it comes back as text', () => {
    const name = 'read-class-source-text--01-read-source';
    const reading = readingFor('text')(wire(name));
    assert.equal(answerRead('text', reading, 'terse'), corpusBody(name));
    const answered = answerRead('text', reading, 'terse');
    assert.ok(typeof answered === 'string' && answered.includes('CLASS'));
  });

  it('metadata was promised as XML, so it is not parsed on the way out', () => {
    const name = 'read-metadata-class--01-classes-zbpmcpshriroot';
    const reading = readingFor('xml')(wire(name));
    const out = answerRead('xml', reading, 'terse');
    assert.equal(out, corpusBody(name));
    assert.equal(typeof out, 'string');
    assert.ok(out.includes('<class:abapClass'));
  });

  it('the same holds for a domain, and for every other family', () => {
    for (const name of [
      'read-metadata-ddl--01-sources-zmcpshriroot',
      'read-metadata-structure--01-structures-zmcpshrstru',
      'read-metadata-package--01-packages-zmcpshrpkg',
    ]) {
      const reading = readingFor('xml')(wire(name));
      assert.equal(answerRead('xml', reading, 'terse'), corpusBody(name));
    }
  });

  it('text and xml answer the same at every detail — the document IS the answer', () => {
    const name = 'read-function-module-source-text--01-read-source';
    const reading = readingFor('text')(wire(name));
    for (const detail of ['terse', 'full', 'raw'] as const) {
      assert.equal(answerRead('text', reading, detail), corpusBody(name));
    }
  });

  it('everything else was promised as JSON, so it is parsed', () => {
    const name = 'read-object-tree-structure--01-nodestructure';
    const reading = readingFor('json')(wire(name));
    const out = answerRead('json', reading, 'terse') as any;
    assert.equal(typeof out, 'object');
    assert.notEqual(out['asx:abap'], undefined);
  });

  it('and JSON still gives the document back at detail raw', () => {
    const name = 'read-object-tree-structure--01-nodestructure';
    const reading = readingFor('json')(wire(name));
    assert.equal(answerRead('json', reading, 'raw'), corpusBody(name));
  });
});

describe('a write says whether it worked, and nothing more', () => {
  it('a create that answered nothing still says it worked', () => {
    const name = 'create-class--01-oo-classes';
    assert.equal(corpusBody(name), '');
    const reading = writeReading(wire(name));
    assert.equal(writeProjection(reading.value, reading.status), 'SUCCESS');
  });

  it('a create that answered a whole document says the same short thing', () => {
    // The valuable half of a write that failed is the refusal, and that comes
    // through analyse. The result has no reason to be bigger on a success.
    const reading = writeReading(wire('create-domain--01-ddic-domains'));
    assert.equal(writeProjection(reading.value, reading.status), 'SUCCESS');
  });

  it('a successful source write says it worked', () => {
    const reading = writeReading(
      wire('update-source-success--02-update-source'),
    );
    assert.equal(writeProjection(reading.value, reading.status), 'SUCCESS');
  });

  it('says nothing when the status was not a success', () => {
    const reading = writeReading(
      wire('refusal-write-not-locked--01-update-source'),
    );
    assert.equal(reading.status, 423);
    assert.equal(writeProjection(reading.value, reading.status), undefined);
  });
});
