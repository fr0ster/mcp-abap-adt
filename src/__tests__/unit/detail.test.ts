import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as z from 'zod';
import { DETAIL_SHAPE, detailOf, levelOf } from '../../lib/strategies/detail';
import { jsonAt, listedJson } from '../helpers/listedJson';

describe('levelOf', () => {
  it('answers the level asked for, medium included, terse by default', () => {
    assert.equal(levelOf({}), 'terse');
    assert.equal(levelOf({ detail: 'medium' }), 'medium');
    assert.equal(levelOf({ detail: 'raw' }), 'raw');
  });
});

describe('detailOf', () => {
  it('defaults to terse', () => {
    assert.equal(detailOf({}), 'terse');
    assert.equal(detailOf({ detail: undefined }), 'terse');
  });

  it('takes the levels the schema declares, medium answering as full', () => {
    assert.equal(detailOf({ detail: 'medium' }), 'full');
    assert.equal(detailOf({ detail: 'full' }), 'full');
    assert.equal(detailOf({ detail: 'raw' }), 'raw');
    assert.equal(detailOf({ detail: 'terse' }), 'terse');
  });

  it('anything else is refused by the schema, before detailOf reads it', () => {
    const schema = z.object(DETAIL_SHAPE);
    assert.equal(schema.safeParse({ detail: 'verbose' }).success, false);
    assert.equal(schema.safeParse({ detail: 7 }).success, false);
  });

  it('declares exactly the four levels it accepts', () => {
    const detail = jsonAt(listedJson(z.object(DETAIL_SHAPE)), 'detail');
    assert.deepStrictEqual(detail.enum, ['terse', 'medium', 'full', 'raw']);
    assert.equal(detail.default, 'terse');
  });
});
