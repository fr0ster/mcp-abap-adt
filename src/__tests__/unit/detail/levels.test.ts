/**
 * The shared detail mechanism (`src/lib/detail/levels.ts`): each level a
 * reading, the answer its value as it is.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
} from '../../../lib/detail';
import { structured } from '../../../lib/strategies/reading';

function wire(data: string, status = 200): IAdtWireResponse {
  return { status, statusText: 'OK', headers: {}, data };
}

const DOCUMENT = '<a:root xmlns:a="x"><a:item a:name="ONE"/></a:root>';

describe('rawLevel', () => {
  it('answers the document as text, with its raw and status', () => {
    assert.deepStrictEqual(rawLevel(wire(DOCUMENT, 201)), {
      value: DOCUMENT,
      raw: DOCUMENT,
      status: 201,
    });
  });
});

describe('fullLevel', () => {
  it('answers the structured parse, as full always answered', () => {
    assert.deepStrictEqual(
      fullLevel(wire(DOCUMENT)).value,
      structured(wire(DOCUMENT)).value,
    );
  });

  it('answers the document itself when it does not parse', () => {
    assert.equal(fullLevel(wire('')).value, '');
    assert.equal(fullLevel(wire('not <xml')).value, 'not <xml');
  });
});

describe('formatted', () => {
  it('formats the typed value with the status, keeping raw and status', () => {
    const level = formatted(
      (answer) => answer.status,
      (value: number, status: number) => `${value}/${status}`,
    );
    assert.deepStrictEqual(level(wire(DOCUMENT, 202)), {
      value: '202/202',
      raw: DOCUMENT,
      status: 202,
    });
  });
});

describe('readingAt and answered', () => {
  const table: DetailTable<string> = {
    terse: formatted(
      () => 'T',
      (value) => value,
    ),
    medium: formatted(
      () => 'M',
      (value) => value,
    ),
    full: formatted(
      () => 'F',
      (value) => value,
    ),
    raw: rawLevel,
  };

  it('picks the level asked for, and answers its value as it is', () => {
    assert.equal(answered(readingAt(table, 'terse')(wire(DOCUMENT))), 'T');
    assert.equal(answered(readingAt(table, 'medium')(wire(DOCUMENT))), 'M');
    assert.equal(answered(readingAt(table, 'full')(wire(DOCUMENT))), 'F');
    assert.equal(answered(readingAt(table, 'raw')(wire(DOCUMENT))), DOCUMENT);
  });
});
