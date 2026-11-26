/**
 * ListATCResults at each `detail`, over the captured result list and a real
 * adt-clients run on a recording connection: terse a row per result written
 * by the listing writer, medium and full every field read as JSON, raw the
 * document as SAP sent it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleListATCResults } from '../../../handlers/atc/high/handleListATCResults';
import type { DetailLevel } from '../../../lib/detail';
import { corpusBody } from '../../helpers/adtCorpus';
import { recordingConnection } from '../../helpers/recordingConnection';

const LIST = corpusBody('atc-results-list-central--01-results');
const EMPTY = corpusBody('atc-results-list-empty--01-results');

/** The tool's answer text at `detail`, over `document`. */
async function listed(
  document: string,
  detail?: DetailLevel,
): Promise<{ isError: boolean; text: string }> {
  const result = await handleListATCResults(
    {
      connection: recordingConnection([{ data: document }]),
      logger: undefined,
    },
    {
      created_by: '*',
      ...(detail === undefined ? {} : { detail }),
    },
  );
  return {
    isError: result.isError === true,
    text: result.content.map((part) => part.text ?? '').join(''),
  };
}

describe('ListATCResults answers at each detail', () => {
  it('terse (the default): the count, a header, a row per result', async () => {
    const terse = await listed(LIST);
    assert.equal(terse.isError, false, terse.text);
    const lines = terse.text.split('\n');
    assert.equal(lines[0], '# count 6');
    assert.equal(
      lines[1],
      'display_id\ttitle\tcheck_variant\tcreated_at\tpriority_1\tpriority_2\tpriority_3\tpriority_4\tfailures',
    );
    assert.equal(
      lines[2],
      'E6AC99B2161F1FE1B5A1E9B68E5CD628\tZMCP_SHR_FGRP\tDEFAULT\t2026-10-31T09:41:53Z\t0\t2\t1\t0\t0',
    );
    assert.equal(lines.length, 2 + 6, terse.text);
  });

  it("terse writes each result's counts per priority and its failures, no run series", async () => {
    const terse = await listed(LIST);
    assert.ok(!terse.text.includes('by_priority'), terse.text);
    assert.ok(!terse.text.includes('run_series'), terse.text);
    assert.ok(!terse.text.startsWith('{'), terse.text);
    const [, header = '', ...rows] = terse.text.split('\n');
    const columns = header.split('\t');
    for (const row of rows) {
      const cells = row.split('\t');
      for (const counted of [
        'priority_1',
        'priority_2',
        'priority_3',
        'priority_4',
        'failures',
      ]) {
        const cell = cells[columns.indexOf(counted)] ?? '';
        assert.ok(
          [...cell].every((c) => c >= '0' && c <= '9'),
          `${counted}: ${row}`,
        );
      }
    }
  });

  it('a count SAP did not send is an empty cell, never 0', async () => {
    const terse = await listed(
      '<atcresult:resultList xmlns:atcresult="http://www.sap.com/adt/atc/result"><atcresult:result><atcresult:displayId>D1</atcresult:displayId><atcresult:title>T</atcresult:title></atcresult:result></atcresult:resultList>',
    );
    assert.equal(terse.text.split('\n')[2], 'D1\tT\t\t\t\t\t\t\t');
  });

  it('terse of an empty list: the count 0 and the header alone', async () => {
    const terse = await listed(EMPTY);
    assert.equal(
      terse.text,
      '# count 0\ndisplay_id\ttitle\tcheck_variant\tcreated_at\tpriority_1\tpriority_2\tpriority_3\tpriority_4\tfailures',
    );
  });

  it('a result with every count non-zero and a run series: the exact row, the series kept for medium and full', async () => {
    const document =
      '<?xml version="1.0" encoding="utf-8"?><atcresult:resultList xmlns:atcresult="http://www.sap.com/adt/atc/result"><atcresult:result><atcresult:displayId>D7</atcresult:displayId><atcresult:title>ZOBJ</atcresult:title><atcresult:checkVariant>VAR</atcresult:checkVariant><atcresult:runSeries>SERIES_A</atcresult:runSeries><atcresult:createdAt>2026-11-01T10:00:00Z</atcresult:createdAt><atcresult:aggregates><atcresult:numPrio1>1</atcresult:numPrio1><atcresult:numPrio2>2</atcresult:numPrio2><atcresult:numPrio3>3</atcresult:numPrio3><atcresult:numPrio4>4</atcresult:numPrio4><atcresult:numFailure>5</atcresult:numFailure></atcresult:aggregates></atcresult:result></atcresult:resultList>';
    const terse = await listed(document);
    assert.equal(
      terse.text,
      [
        '# count 1',
        'display_id\ttitle\tcheck_variant\tcreated_at\tpriority_1\tpriority_2\tpriority_3\tpriority_4\tfailures',
        'D7\tZOBJ\tVAR\t2026-11-01T10:00:00Z\t1\t2\t3\t4\t5',
      ].join('\n'),
    );
    for (const detail of ['medium', 'full'] as const) {
      const json = JSON.parse((await listed(document, detail)).text);
      assert.equal(json.results[0].run_series, 'SERIES_A', detail);
      assert.deepStrictEqual(json.results[0].by_priority, {
        '1': 1,
        '2': 2,
        '3': 3,
        '4': 4,
      });
      assert.equal(json.results[0].failures, 5);
    }
  });

  for (const detail of ['medium', 'full'] as const) {
    it(`${detail}: every field read, as JSON`, async () => {
      const answered = await listed(LIST, detail);
      const json = JSON.parse(answered.text);
      assert.equal(json.success, true);
      assert.equal(json.result_count, 6);
      assert.deepStrictEqual(json.results[0], {
        display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628',
        title: 'ZMCP_SHR_FGRP',
        check_variant: 'DEFAULT',
        created_at: '2026-10-31T09:41:53Z',
        by_priority: { '1': 0, '2': 2, '3': 1, '4': 0 },
        failures: 0,
      });
    });
  }

  it('raw: the document as SAP sent it', async () => {
    const raw = await listed(LIST, 'raw');
    assert.equal(raw.text, LIST);
  });
});
