import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { parseAtcWorklist } from '../../lib/strategies/atcFindings';
import {
  parseAtcResult,
  parseAtcResultList,
} from '../../lib/strategies/atcResults';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject, assertNoProperty } from '../helpers/assertions';

/**
 * The ATC results, read against the documents SAP answered (the cloud trial,
 * 2026-11-02): a list of central results, one result by its Display ID, and
 * an empty list.
 */

const LIST = corpusBody('atc-results-list-central--01-results');
const ONE = corpusBody(
  'atc-result-by-display-id--01-results-e6ac99b2161f1fe1b5a1e9b68e5cd628',
);
const EMPTY = corpusBody('atc-results-list-empty--01-results');
const OBJECTS = corpusBody(
  'atc-result-by-display-id-objects--01-results-e6ac99b2161f1fe1b5a26b71db975628',
);

/** The worklist a result's `objects` element would be, to read it the worklist's way. */
const asWorklist = (result: string): string =>
  `<atcworklist:worklist xmlns:atcworklist="http://www.sap.com/adt/atc/worklist"><atcworklist:objects>${result.slice(
    result.indexOf('<atcresult:objects>') + '<atcresult:objects>'.length,
    result.indexOf('</atcresult:objects>'),
  )}</atcworklist:objects></atcworklist:worklist>`;

describe('the ATC result list, against the captured document', () => {
  it('reads every result, in the order SAP sent them', () => {
    const { results } = parseAtcResultList(LIST);
    assert.equal(results.length, 6);
    assert.deepStrictEqual(results[0], {
      display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628',
      title: 'ZMCP_SHR_FGRP',
      check_variant: 'DEFAULT',
      created_at: '2026-10-31T09:41:53Z',
      by_priority: { '1': 0, '2': 2, '3': 1, '4': 0 },
      failures: 0,
    });
  });

  it('leaves out a run series SAP sent empty', () => {
    const { results } = parseAtcResultList(LIST);
    for (const result of results) assertNoProperty(result, 'run_series');
  });

  it('keeps a run series SAP named', () => {
    const doc =
      '<r:resultList xmlns:r="http://www.sap.com/adt/atc/result"><r:result><r:displayId>D1</r:displayId><r:runSeries>BASELINE</r:runSeries></r:result></r:resultList>';
    assert.equal(parseAtcResultList(doc).results[0]?.run_series, 'BASELINE');
  });

  it('answers no results for the empty list', () => {
    assert.deepStrictEqual(parseAtcResultList(EMPTY), { results: [] });
  });
});

describe('one ATC result, against the captured document', () => {
  it('reads the result and every finding of its objects', () => {
    const result = parseAtcResult(ONE);
    assertMatchObject(result, {
      display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628',
      title: 'ZMCP_SHR_FGRP',
      check_variant: 'DEFAULT',
      created_at: '2026-10-31T09:41:53Z',
      objects_checked: 1,
    });
    assert.deepStrictEqual(
      result.findings.map((f) => [f.priority, f.line, f.check]),
      [
        [2, 10, 'Slow parameter passing'],
        [2, 10, 'Slow parameter passing'],
        [3, 9, 'Extended Program Check (SLIN)'],
      ],
    );
    assertMatchObject(result.findings[0], {
      object: 'ZMCP_SHR_FGRP',
      object_type: 'FUGR',
      location:
        '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main',
      message: 'Parameter contains strings and is passed by VALUE',
      check_class: 'CL_CI_TEST_VALUE_PARAMETER',
    });
  });

  /**
   * The result's own `aggregates` read zero in every priority while it holds
   * three findings (measured), so the counts are the findings'.
   */
  it('counts the priorities from the findings, not from its aggregates', () => {
    assert.deepStrictEqual(parseAtcResult(ONE).by_priority, { '2': 2, '3': 1 });
  });

  for (const [_what, document] of [
    ['one object', ONE],
    ['three objects', OBJECTS],
  ]) {
    it(
      format(
        'answers what the worklist reading gives for the same objects: %s',
        _what,
      ),
      () => {
        const read = parseAtcResult(document);
        assert.deepStrictEqual(parseAtcWorklist(asWorklist(document)), {
          findings: read.findings,
          objects_checked: read.objects_checked,
          by_priority: read.by_priority,
        });
      },
    );
  }
});

describe('one ATC result over several objects, against the captured document', () => {
  it('keeps each finding beside the object it was found in', () => {
    const result = parseAtcResult(OBJECTS);
    assert.equal(result.objects_checked, 3);
    assert.deepStrictEqual(
      result.findings.map((f) => [f.object, f.object_type, f.priority, f.line]),
      [
        ['ZCL_MCP_S9C_AU', 'CLAS', 1, 11],
        ['ZCL_MCP_S9C_CDT', 'CLAS', 2, 17],
        ['ZMCP_S9C_FG', 'FUGR', 3, 3],
        ['ZMCP_S9C_FG', 'FUGR', 3, 2],
      ],
    );
    assert.deepStrictEqual(result.by_priority, { '1': 1, '2': 1, '3': 2 });
  });
});
