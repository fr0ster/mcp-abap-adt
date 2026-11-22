/**
 * GetMainPrograms at each `detail` (terse answers, step 3): terse a
 * `type\tname` row per main program under its include; medium every field
 * but the uri; full the answer before `detail`; raw SAP's document.
 *
 * Replayed over a recording connection: real adt-clients code, no SAP.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetMainPrograms } from '../../handlers/include/readonly/handleGetMainPrograms';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

const DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zprog" adtcore:type="PROG/P" adtcore:name="ZPROG"/></adtcore:objectReferences>';

async function mainPrograms(
  detail?: 'terse' | 'medium' | 'full' | 'raw',
): Promise<string> {
  const connection = recordingConnection([{ data: DOCUMENT }]);
  declareSystemKind(connection, 'onprem');
  const result = await handleGetMainPrograms(
    { connection, logger: undefined },
    { include_name: 'zinc', ...(detail === undefined ? {} : { detail }) },
  );
  assert.equal(result.isError, false, result.content[0]?.text);
  return result.content[0]?.text ?? '';
}

describe('GetMainPrograms detail', () => {
  it('terse, by default: a type and name row per main program', async () => {
    const expected = '# include ZINC\ntype\tname\nPROG/P\tZPROG';
    assert.equal(await mainPrograms(), expected);
    assert.equal(await mainPrograms('terse'), expected);
  });

  it('medium: every field but the uri', async () => {
    assert.deepStrictEqual(JSON.parse(await mainPrograms('medium')), {
      include_name: 'ZINC',
      main_programs: [{ name: 'ZPROG', type: 'PROG/P' }],
    });
  });

  it('full: the answer before detail', async () => {
    assert.deepStrictEqual(JSON.parse(await mainPrograms('full')), {
      success: true,
      include_name: 'ZINC',
      main_programs: [
        {
          name: 'ZPROG',
          type: 'PROG/P',
          uri: '/sap/bc/adt/programs/programs/zprog',
        },
      ],
    });
  });

  it('raw: the document', async () => {
    assert.equal(await mainPrograms('raw'), DOCUMENT);
  });
});
