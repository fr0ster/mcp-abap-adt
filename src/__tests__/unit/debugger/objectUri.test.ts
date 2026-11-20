import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressOf,
  lineUriOf,
  sourceUriOf,
} from '../../../lib/debugger/objectUri';
import { assertThrows } from '../../helpers/assertions';

describe('the source a line names', () => {
  it('a class main source, as the recorded breakpoint answer names it', () => {
    assert.equal(
      lineUriOf({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE' }, 32),
      '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
    );
  });
  it('a class include, a program, an include, a function module', () => {
    assert.equal(
      sourceUriOf({
        object_type: 'CLAS',
        object_name: 'ZCL_A',
        include: 'testclasses',
      }),
      '/sap/bc/adt/oo/classes/zcl_a/includes/testclasses',
    );
    assert.equal(
      sourceUriOf({ object_type: 'PROG', object_name: 'ZP' }),
      '/sap/bc/adt/programs/programs/zp/source/main',
    );
    assert.equal(
      sourceUriOf({ object_type: 'INCL', object_name: 'ZI' }),
      '/sap/bc/adt/programs/includes/zi/source/main',
    );
    assert.equal(
      sourceUriOf({
        object_type: 'FUNC',
        object_name: 'Z_FM',
        parent_name: 'ZFG',
      }),
      '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main',
    );
  });
  it('long type forms and namespaces', () => {
    assert.equal(
      sourceUriOf({ object_type: 'CLAS/OC', object_name: 'ZCL_A' }),
      '/sap/bc/adt/oo/classes/zcl_a/source/main',
    );
    assert.equal(
      sourceUriOf({ object_type: 'PROG/I', object_name: 'ZI' }),
      '/sap/bc/adt/programs/includes/zi/source/main',
    );
    assert.equal(
      sourceUriOf({ object_type: 'CLAS', object_name: '/NS/CL_A' }),
      '/sap/bc/adt/oo/classes/%2Fns%2Fcl_a/source/main',
    ); // encodeURIComponent writes upper-case hex
  });
  it('refuses what holds no breakpoint, and a function module without its group', () => {
    assertThrows(
      () => sourceUriOf({ object_type: 'TABL', object_name: 'T' }),
      /CLAS, PROG, INCL, FUNC/,
    );
    assertThrows(
      () => sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM' }),
      /parent_name/,
    );
  });
  it('reads an address back from a stack frame URI', () => {
    assert.deepStrictEqual(
      addressOf(
        '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32,0',
      ),
      {
        object_type: 'CLAS',
        object_name: 'ZCL_CV_DBG_MEASURE',
        line: 32,
      },
    );
    assert.deepStrictEqual(
      addressOf(
        '/sap/bc/adt/oo/classes/cl_oo_adt_res_classrun/source/main#type=CLAS%2FOM;name=EXECUTE_CLAS;start=105',
      ),
      {
        object_type: 'CLAS',
        object_name: 'CL_OO_ADT_RES_CLASSRUN',
        line: 105,
      },
    );
    assert.deepStrictEqual(
      addressOf(
        '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main#start=7',
      ),
      {
        object_type: 'FUNC',
        object_name: 'Z_FM',
        parent_name: 'ZFG',
        line: 7,
      },
    );
    assert.deepStrictEqual(
      addressOf('/sap/bc/adt/oo/classes/zcl_a/includes/testclasses#start=3'),
      {
        object_type: 'CLAS',
        object_name: 'ZCL_A',
        include: 'testclasses',
        line: 3,
      },
    );
    assert.equal(addressOf(''), undefined);
  });
});
