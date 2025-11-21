import { TOOL_DEFINITION as GET_PROGRAM_TOOL } from '../handlers/handleGetProgram';
import { TOOL_DEFINITION as GET_CLASS_TOOL } from '../handlers/handleGetClass';
import { TOOL_DEFINITION as GET_FUNCTION_TOOL } from '../handlers/handleGetFunction';
import { TOOL_DEFINITION as GET_TABLE_TOOL } from '../handlers/handleGetTable';
import { TOOL_DEFINITION as SEARCH_OBJECT_TOOL } from '../handlers/handleSearchObject';

describe('Tool Definitions', () => {
  describe('Tool Names', () => {
    it('should have correct tool names', () => {
      expect(GET_PROGRAM_TOOL.name).toBe('GetProgram');
      expect(GET_CLASS_TOOL.name).toBe('GetClass');
      expect(GET_FUNCTION_TOOL.name).toBe('GetFunction');
      expect(GET_TABLE_TOOL.name).toBe('GetTable');
      expect(SEARCH_OBJECT_TOOL.name).toBe('SearchObject');
    });
  });

  describe('Tool Descriptions', () => {
    it('should have non-empty descriptions', () => {
      expect(GET_PROGRAM_TOOL.description).toBeTruthy();
      expect(GET_CLASS_TOOL.description).toBeTruthy();
      expect(GET_FUNCTION_TOOL.description).toBeTruthy();
      expect(GET_TABLE_TOOL.description).toBeTruthy();
      expect(SEARCH_OBJECT_TOOL.description).toBeTruthy();
    });

    it('descriptions should be strings', () => {
      expect(typeof GET_PROGRAM_TOOL.description).toBe('string');
      expect(typeof GET_CLASS_TOOL.description).toBe('string');
      expect(typeof GET_FUNCTION_TOOL.description).toBe('string');
      expect(typeof GET_TABLE_TOOL.description).toBe('string');
      expect(typeof SEARCH_OBJECT_TOOL.description).toBe('string');
    });
  });

  describe('Input Schemas', () => {
    it('should have inputSchema defined', () => {
      expect(GET_PROGRAM_TOOL.inputSchema).toBeDefined();
      expect(GET_CLASS_TOOL.inputSchema).toBeDefined();
      expect(GET_FUNCTION_TOOL.inputSchema).toBeDefined();
      expect(GET_TABLE_TOOL.inputSchema).toBeDefined();
      expect(SEARCH_OBJECT_TOOL.inputSchema).toBeDefined();
    });

    it('should have object type inputSchema', () => {
      expect(typeof GET_PROGRAM_TOOL.inputSchema).toBe('object');
      expect(typeof GET_CLASS_TOOL.inputSchema).toBe('object');
      expect(typeof GET_FUNCTION_TOOL.inputSchema).toBe('object');
      expect(typeof GET_TABLE_TOOL.inputSchema).toBe('object');
      expect(typeof SEARCH_OBJECT_TOOL.inputSchema).toBe('object');
    });
  });
});
