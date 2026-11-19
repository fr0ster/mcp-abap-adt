/**
 * A message's `href` read into its source uri and position
 * (`src/lib/sourceHref.ts`, fr0ster/mcp-abap-adt#351). The hrefs are the
 * ones recorded in this repository's fixtures and the one the 751 report
 * carried.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { fragmentStart, readSourceHref } from '../../lib/sourceHref';

describe('readSourceHref', () => {
  it('reads #start=LINE,COLUMN (the 751 report)', () => {
    assert.deepStrictEqual(
      readSourceHref(
        '/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main#start=16,15',
      ),
      {
        uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main',
        position: { line: 16, column: 15 },
      },
    );
  });

  it('reads #start=LINE,COLUMN;end=LINE,COLUMN', () => {
    assert.deepStrictEqual(
      readSourceHref(
        '/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main#start=3,17;end=3,29',
      ),
      {
        uri: '/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main',
        position: { line: 3, column: 17, end: { line: 3, column: 29 } },
      },
    );
  });

  it('an href with no fragment names its uri alone (DOMA, DTEL)', () => {
    assert.deepStrictEqual(
      readSourceHref('/sap/bc/adt/ddic/domains/zobj_doma_broken'),
      { uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken' },
    );
    assert.deepStrictEqual(
      readSourceHref('/sap/bc/adt/ddic/dataelements/zobj_dtel_broken'),
      { uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_broken' },
    );
  });

  it('an empty href names nothing', () => {
    assert.equal(readSourceHref(''), undefined);
  });

  for (const [_case, fragment] of [
    ['a line alone', '#start=29'],
    ['no start', '#type=CLAS%2FOM;name=POST'],
    ['an empty fragment', '#'],
    ['letters in the line', '#start=1a,2'],
    ['an empty column', '#start=16,'],
    ['a negative line', '#start=-1,2'],
    ['three numbers', '#start=1,2,3'],
    ['two starts', '#start=1,2;start=3,4'],
    ['an end that does not read', '#start=1,2;end=x'],
    ['an end without a column', '#start=1,2;end=3'],
  ]) {
    it(format('%s gives no position, the uri alone', _case), () => {
      assert.deepStrictEqual(
        readSourceHref(`/sap/bc/adt/x/source/main${fragment}`),
        {
          uri: '/sap/bc/adt/x/source/main',
        },
      );
    });
  }
});

describe('fragmentStart', () => {
  it('reads a line with its column, and a line alone', () => {
    assert.deepStrictEqual(fragmentStart('start=9,4'), { line: 9, column: 4 });
    assert.deepStrictEqual(fragmentStart('type=CLAS%2FOM;name=POST;start=29'), {
      line: 29,
    });
  });

  it('none where no start reads', () => {
    assert.equal(fragmentStart('type=CLAS%2FOM'), undefined);
    assert.equal(fragmentStart('start=x'), undefined);
  });
});
