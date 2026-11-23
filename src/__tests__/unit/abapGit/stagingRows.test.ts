/**
 * GetAbapGitStaging's rows (plan step 9.7a): every staged object once per
 * file — an object with two files is two rows, its own cells on each — and
 * an object without files is one row, its file cells empty. Nothing of an
 * object is dropped for having no file.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAbapGitStagingFacts } from '@mcp-abap-adt/adt-strategies';
import { STAGING_ANSWERS } from '../../../lib/abapGit/formats';

const FACTS: IAbapGitStagingFacts = {
  unstaged: [
    {
      wbkey: 'CLASZCL_TWO',
      version: 'active',
      uri: '/sap/bc/adt/oo/classes/zcl_two',
      type: 'CLAS/OC',
      name: 'ZCL_TWO',
      packageName: 'ZPKG',
      files: [
        {
          name: 'zcl_two.clas.abap',
          path: '/src/',
          localState: 'M',
          remoteState: '',
        },
        {
          name: 'zcl_two.clas.xml',
          path: '/src/',
          localState: 'A',
          remoteState: 'D',
        },
      ],
    },
    {
      wbkey: 'PROGZNONE',
      version: 'active',
      uri: '/sap/bc/adt/programs/programs/znone',
      type: 'PROG/P',
      name: 'ZNONE',
      packageName: 'ZPKG',
      files: [],
    },
  ],
  staged: [],
  ignored: [],
  author: { name: 'Ada', email: 'ada@example.invalid' },
  committer: { name: 'Carl', email: 'carl@example.invalid' },
};

const answered = { status: 200, facts: FACTS };

describe('GetAbapGitStaging: an object per file, an object without files once', () => {
  it('terse: two rows for two files, one row with empty file cells for none', () => {
    const lines = STAGING_ANSWERS.terse(answered).answer.split('\n');
    assert.deepStrictEqual(lines.slice(4, 7), [
      'CLAS/OC\tZCL_TWO\tZPKG\tzcl_two.clas.abap\tM\t',
      'CLAS/OC\tZCL_TWO\tZPKG\tzcl_two.clas.xml\tA\tD',
      'PROG/P\tZNONE\tZPKG\t\t\t',
    ]);
  });

  it('medium: every field of the object on each of its rows', () => {
    const lines = STAGING_ANSWERS.medium(answered).answer.split('\n');
    assert.deepStrictEqual(lines.slice(4, 7), [
      'CLASZCL_TWO\tactive\t/sap/bc/adt/oo/classes/zcl_two\tCLAS/OC\tZCL_TWO\tZPKG\tzcl_two.clas.abap\t/src/\tM\t',
      'CLASZCL_TWO\tactive\t/sap/bc/adt/oo/classes/zcl_two\tCLAS/OC\tZCL_TWO\tZPKG\tzcl_two.clas.xml\t/src/\tA\tD',
      'PROGZNONE\tactive\t/sap/bc/adt/programs/programs/znone\tPROG/P\tZNONE\tZPKG\t\t\t\t',
    ]);
  });
});
