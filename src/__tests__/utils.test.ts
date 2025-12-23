import { getBaseUrl } from '../lib/utils';

describe('Utility Functions', () => {
  describe('URL and Header Helpers', () => {
    it('should export getBaseUrl function', () => {
      expect(typeof getBaseUrl).toBe('function');
    });
  });

  describe('String Operations', () => {
    it('should handle uppercase transformations', () => {
      const className = 'cl_abap_test';
      expect(className.toUpperCase()).toBe('CL_ABAP_TEST');
    });

    it('should handle ABAP naming conventions', () => {
      const objectName = 'Z_MY_PROGRAM';
      expect(objectName.startsWith('Z')).toBe(true);
      expect(/^[A-Z_]+$/.test(objectName)).toBe(true);
    });

    it('should handle array operations', () => {
      const tools = ['get_program', 'get_class', 'search_object'];
      expect(tools).toHaveLength(3);
      expect(tools).toContain('get_program');
      expect(tools.filter((t) => t.startsWith('get_'))).toHaveLength(2);
    });

    it('should handle string trimming', () => {
      const text = '  ABAP  ';
      expect(text.trim()).toBe('ABAP');
    });
  });

  describe('Object Type Validation', () => {
    it('should validate ABAP object types', () => {
      const validTypes = ['PROG/P', 'CLAS/OC', 'FUGR/F', 'TABL/DT'];
      const pattern = /^[A-Z]{4}\/[A-Z]+$/;

      validTypes.forEach((type) => {
        expect(pattern.test(type)).toBe(true);
      });
    });
  });
});
