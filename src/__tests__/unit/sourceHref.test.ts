/**
 * A message's `href` read into its source uri and position
 * (`src/lib/sourceHref.ts`, fr0ster/mcp-abap-adt#351). The hrefs are the
 * ones recorded in this repository's fixtures and the one the 751 report
 * carried.
 */
import { fragmentStart, readSourceHref } from '../../lib/sourceHref';

describe('readSourceHref', () => {
  it('reads #start=LINE,COLUMN (the 751 report)', () => {
    expect(
      readSourceHref(
        '/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main#start=16,15',
      ),
    ).toEqual({
      uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main',
      position: { line: 16, column: 15 },
    });
  });

  it('reads #start=LINE,COLUMN;end=LINE,COLUMN', () => {
    expect(
      readSourceHref(
        '/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main#start=3,17;end=3,29',
      ),
    ).toEqual({
      uri: '/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main',
      position: { line: 3, column: 17, end: { line: 3, column: 29 } },
    });
  });

  it('an href with no fragment names its uri alone (DOMA, DTEL)', () => {
    expect(readSourceHref('/sap/bc/adt/ddic/domains/zobj_doma_broken')).toEqual(
      { uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken' },
    );
    expect(
      readSourceHref('/sap/bc/adt/ddic/dataelements/zobj_dtel_broken'),
    ).toEqual({ uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_broken' });
  });

  it('an empty href names nothing', () => {
    expect(readSourceHref('')).toBeUndefined();
  });

  it.each([
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
  ])('%s gives no position, the uri alone', (_case, fragment) => {
    expect(readSourceHref(`/sap/bc/adt/x/source/main${fragment}`)).toEqual({
      uri: '/sap/bc/adt/x/source/main',
    });
  });
});

describe('fragmentStart', () => {
  it('reads a line with its column, and a line alone', () => {
    expect(fragmentStart('start=9,4')).toEqual({ line: 9, column: 4 });
    expect(fragmentStart('type=CLAS%2FOM;name=POST;start=29')).toEqual({
      line: 29,
    });
  });

  it('none where no start reads', () => {
    expect(fragmentStart('type=CLAS%2FOM')).toBeUndefined();
    expect(fragmentStart('start=x')).toBeUndefined();
  });
});
