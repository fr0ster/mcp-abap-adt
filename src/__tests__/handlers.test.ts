import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_DEFINITION as GET_CLASS_TOOL } from '../handlers/class/high/handleGetClass';
import { TOOL_DEFINITION as GET_FUNCTION_MODULE_TOOL } from '../handlers/function_module/high/handleGetFunctionModule';
import { TOOL_DEFINITION as GET_PROGRAM_TOOL } from '../handlers/program/high/handleGetProgram';
import { TOOL_DEFINITION as SEARCH_OBJECT_TOOL } from '../handlers/search/readonly/handleSearchObject';
import { TOOL_DEFINITION as GET_TABLE_TOOL } from '../handlers/table/high/handleGetTable';

describe('Tool Definitions', () => {
  describe('Tool Names', () => {
    it('should have correct tool names', () => {
      assert.equal(GET_PROGRAM_TOOL.name, 'GetProgram');
      assert.equal(GET_CLASS_TOOL.name, 'GetClass');
      assert.equal(GET_FUNCTION_MODULE_TOOL.name, 'GetFunctionModule');
      assert.equal(GET_TABLE_TOOL.name, 'GetTable');
      assert.equal(SEARCH_OBJECT_TOOL.name, 'SearchObject');
    });
  });

  describe('Tool Descriptions', () => {
    it('should have non-empty descriptions', () => {
      assert.ok(GET_PROGRAM_TOOL.description);
      assert.ok(GET_CLASS_TOOL.description);
      assert.ok(GET_FUNCTION_MODULE_TOOL.description);
      assert.ok(GET_TABLE_TOOL.description);
      assert.ok(SEARCH_OBJECT_TOOL.description);
    });

    it('descriptions should be strings', () => {
      assert.equal(typeof GET_PROGRAM_TOOL.description, 'string');
      assert.equal(typeof GET_CLASS_TOOL.description, 'string');
      assert.equal(typeof GET_FUNCTION_MODULE_TOOL.description, 'string');
      assert.equal(typeof GET_TABLE_TOOL.description, 'string');
      assert.equal(typeof SEARCH_OBJECT_TOOL.description, 'string');
    });
  });

  describe('Input Schemas', () => {
    it('should have inputSchema defined', () => {
      assert.notEqual(GET_PROGRAM_TOOL.inputSchema, undefined);
      assert.notEqual(GET_CLASS_TOOL.inputSchema, undefined);
      assert.notEqual(GET_FUNCTION_MODULE_TOOL.inputSchema, undefined);
      assert.notEqual(GET_TABLE_TOOL.inputSchema, undefined);
      assert.notEqual(SEARCH_OBJECT_TOOL.inputSchema, undefined);
    });

    it('should have object type inputSchema', () => {
      assert.equal(typeof GET_PROGRAM_TOOL.inputSchema, 'object');
      assert.equal(typeof GET_CLASS_TOOL.inputSchema, 'object');
      assert.equal(typeof GET_FUNCTION_MODULE_TOOL.inputSchema, 'object');
      assert.equal(typeof GET_TABLE_TOOL.inputSchema, 'object');
      assert.equal(typeof SEARCH_OBJECT_TOOL.inputSchema, 'object');
    });
  });
});
