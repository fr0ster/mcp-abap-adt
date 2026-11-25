/**
 * SearchObject answers every hit SAP's quick search answered, and sends the
 * mask and `maxResults` as given.
 *
 * Measured on premise (2026-11-22, BASIS 816), raw GETs of
 * `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch`:
 * a mask whose prefix only one object carries answered one
 * `adtcore:objectReference`, and a prefix one character shorter answered
 * nine — the one row is SAP's whole answer, not a cut of ours. This file
 * holds the other half: what SAP answers, the tool answers whole.
 *
 * Each case runs the handler over a recording connection — real
 * adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleSearchObject } from '../../handlers/search/readonly/handleSearchObject';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

/** A quickSearch answer of `count` hits, the names sanitised. */
function hits(count: number): string {
  const refs = Array.from(
    { length: count },
    (_, i) =>
      `<adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_hit_${i}" adtcore:type="CLAS/OC" adtcore:name="ZCL_HIT_${i}" adtcore:packageName="ZPKG_HITS" adtcore:description="hit ${i}"/>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${refs.join('')}</adtcore:objectReferences>`;
}

async function searchAnswering(count: number, maxResults: number) {
  const connection = recordingConnection([{ data: hits(count) }]);
  declareSystemKind(connection, 'onprem');
  const result = await handleSearchObject(
    { connection },
    { object_name: 'ZCL_HIT*', maxResults },
  );
  const text = result.content
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
  return { result, text, requests: connection.requests };
}

describe('SearchObject answers every hit', () => {
  for (const count of [1, 2, 100]) {
    it(`${count} hit(s) answered: ${count} row(s) under the header`, async () => {
      const { result, text } = await searchAnswering(count, 100);
      assert.equal(result.isError, false, text);
      const rows = text.split('\n');
      assert.equal(rows[0], 'name\ttype\tdescription\tpackage');
      assert.equal(rows.length, count + 1, text.slice(0, 500));
      assert.equal(
        rows[count],
        `ZCL_HIT_${count - 1}\tCLAS/OC\thit ${count - 1}\tZPKG_HITS`,
      );
    });
  }

  it('the mask and maxResults go on the wire as given', async () => {
    const { requests } = await searchAnswering(1, 37);
    assert.equal(requests.length, 1);
    const url = new URL(requests[0]?.url ?? '', 'https://system.invalid');
    assert.equal(url.searchParams.get('operation'), 'quickSearch');
    assert.equal(url.searchParams.get('query'), 'ZCL_HIT*');
    assert.equal(url.searchParams.get('maxResults'), '37');
  });
});
