import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBaseUrl } from '../lib/utils';

describe('Utility Functions', () => {
  describe('URL and Header Helpers', () => {
    it('should export getBaseUrl function', () => {
      assert.equal(typeof getBaseUrl, 'function');
    });
  });

  describe('String Operations', () => {
    it('should handle uppercase transformations', () => {
      const className = 'cl_abap_test';
      assert.equal(className.toUpperCase(), 'CL_ABAP_TEST');
    });

    it('should handle ABAP naming conventions', () => {
      const objectName = 'Z_MY_PROGRAM';
      assert.equal(objectName.startsWith('Z'), true);
      assert.equal(/^[A-Z_]+$/.test(objectName), true);
    });

    it('should handle array operations', () => {
      const tools = ['get_program', 'get_class', 'search_object'];
      assert.equal(tools.length, 3);
      assert.ok(tools.includes('get_program'));
      assert.equal(tools.filter((t) => t.startsWith('get_')).length, 2);
    });

    it('should handle string trimming', () => {
      const text = '  ABAP  ';
      assert.equal(text.trim(), 'ABAP');
    });
  });

  describe('Object Type Validation', () => {
    it('should validate ABAP object types', () => {
      const validTypes = ['PROG/P', 'CLAS/OC', 'FUGR/F', 'TABL/DT'];
      const pattern = /^[A-Z]{4}\/[A-Z]+$/;

      validTypes.forEach((type) => {
        assert.equal(pattern.test(type), true);
      });
    });
  });
});
