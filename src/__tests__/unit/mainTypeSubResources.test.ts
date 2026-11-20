/**
 * A main type stands for the object, never for one of its sub-resources: the
 * text elements (`PROG/PX`, `CLAS/OCX`) and a table's technical settings
 * (`TABL/DTT`) are codes of their own, named as codes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TABLE_CODES } from '../../lib/adtProjections';
import { acceptedCodeOf, notATableType } from '../../lib/adtTypeCode';

describe('a main type ignores the sub-resource codes', () => {
  for (const variant of ['onprem', 'cloud'] as const) {
    it(`CLAS is the class among the table codes on ${variant}`, () => {
      assert.equal(acceptedCodeOf('CLAS', TABLE_CODES[variant], []), 'CLAS/OC');
    });

    it(`each sub-resource code is taken as a code on ${variant}`, () => {
      for (const code of ['PROG/PX', 'CLAS/OCX', 'TABL/DTT'] as const) {
        assert.equal(acceptedCodeOf(code, TABLE_CODES[variant], []), code);
      }
    });

    it(`TABL stays the two dictionary codes it shares on ${variant}`, () => {
      assert.equal(acceptedCodeOf('TABL', TABLE_CODES[variant], []), undefined);
      assert.equal(
        notATableType('object_type', 'TABL', variant),
        'object_type "TABL" is the main type of TABL/DT, TABL/DS: name one of these codes; nothing was sent',
      );
    });
  }
});
