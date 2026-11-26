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
    assert.equal(lines[1], 'display_id\ttitle\tcheck_variant\tcreated_at');
    assert.equal(
      lines[2],
      'E6AC99B2161F1FE1B5A1E9B68E5CD628\tZMCP_SHR_FGRP\tDEFAULT\t2026-10-31T09:41:53Z',
    );
    assert.equal(lines.length, 2 + 6, terse.text);
  });

  it('terse carries none of the counts per priority or the failures', async () => {
    const terse = await listed(LIST);
    assert.ok(!terse.text.includes('by_priority'), terse.text);
    assert.ok(!terse.text.includes('failures'), terse.text);
    assert.ok(!terse.text.startsWith('{'), terse.text);
  });

  it('terse of an empty list: the count 0 and the header alone', async () => {
    const terse = await listed(EMPTY);
    assert.equal(
      terse.text,
      '# count 0\ndisplay_id\ttitle\tcheck_variant\tcreated_at',
    );
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
