import { describe, it } from 'node:test';

describe('MCP ABAP ADT Server', () => {
  describe('Module Imports', () => {
    it('should require handler modules without errors', () => {
      require('../handlers/program/high/handleGetProgram');
      require('../handlers/class/high/handleGetClass');
      require('../handlers/function_module/high/handleGetFunctionModule');
    });

    it('should require utility modules without errors', () => {
      require('../lib/utils');
      require('../lib/logger');
    });
  });
});
