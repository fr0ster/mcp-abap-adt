import {
  addressOf,
  lineUriOf,
  sourceUriOf,
} from '../../../lib/debugger/objectUri';

describe('the source a line names', () => {
  it('a class main source, as the recorded breakpoint answer names it', () => {
    expect(
      lineUriOf({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE' }, 32),
    ).toBe('/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32');
  });
  it('a class include, a program, an include, a function module', () => {
    expect(
      sourceUriOf({
        object_type: 'CLAS',
        object_name: 'ZCL_A',
        include: 'testclasses',
      }),
    ).toBe('/sap/bc/adt/oo/classes/zcl_a/includes/testclasses');
    expect(sourceUriOf({ object_type: 'PROG', object_name: 'ZP' })).toBe(
      '/sap/bc/adt/programs/programs/zp/source/main',
    );
    expect(sourceUriOf({ object_type: 'INCL', object_name: 'ZI' })).toBe(
      '/sap/bc/adt/programs/includes/zi/source/main',
    );
    expect(
      sourceUriOf({
        object_type: 'FUNC',
        object_name: 'Z_FM',
        parent_name: 'ZFG',
      }),
    ).toBe('/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main');
  });
  it('long type forms and namespaces', () => {
    expect(sourceUriOf({ object_type: 'CLAS/OC', object_name: 'ZCL_A' })).toBe(
      '/sap/bc/adt/oo/classes/zcl_a/source/main',
    );
    expect(sourceUriOf({ object_type: 'PROG/I', object_name: 'ZI' })).toBe(
      '/sap/bc/adt/programs/includes/zi/source/main',
    );
    expect(sourceUriOf({ object_type: 'CLAS', object_name: '/NS/CL_A' })).toBe(
      '/sap/bc/adt/oo/classes/%2Fns%2Fcl_a/source/main',
    ); // encodeURIComponent writes upper-case hex
  });
  it('refuses what holds no breakpoint, and a function module without its group', () => {
    expect(() =>
      sourceUriOf({ object_type: 'TABL', object_name: 'T' }),
    ).toThrow(/CLAS, PROG, INCL, FUNC/);
    expect(() =>
      sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM' }),
    ).toThrow(/parent_name/);
  });
  it('reads an address back from a stack frame URI', () => {
    expect(
      addressOf(
        '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32,0',
      ),
    ).toEqual({
      object_type: 'CLAS',
      object_name: 'ZCL_CV_DBG_MEASURE',
      line: 32,
    });
    expect(
      addressOf(
        '/sap/bc/adt/oo/classes/cl_oo_adt_res_classrun/source/main#type=CLAS%2FOM;name=EXECUTE_CLAS;start=105',
      ),
    ).toEqual({
      object_type: 'CLAS',
      object_name: 'CL_OO_ADT_RES_CLASSRUN',
      line: 105,
    });
    expect(
      addressOf(
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main#start=7',
      ),
    ).toEqual({
      object_type: 'FUNC',
      object_name: 'Z_FM',
      parent_name: 'ZFG',
      line: 7,
    });
    expect(
      addressOf('/sap/bc/adt/oo/classes/zcl_a/includes/testclasses#start=3'),
    ).toEqual({
      object_type: 'CLAS',
      object_name: 'ZCL_A',
      include: 'testclasses',
      line: 3,
    });
    expect(addressOf('')).toBeUndefined();
  });
});
