/**
 * What a function module's unit run covers, as the tools state it: SAP
 * replaces a FUNC run object by the function group holding the module
 * (`CL_AUL_TEST_SUITE->replace_func_w_fugr`, read on premise and on the
 * cloud), so the run covers the tests of the module's whole function group.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOL_DEFINITION as HandlerUnitTestRun } from '../../../../compact-modify/src/handlers/handleHandlerUnitTestRun';
import { TOOL_DEFINITION as RunAbapUnit } from '../../../handlers/unit_test/high/handleRunAbapUnit';
import { TOOL_DEFINITION as RunFunctionModuleUnitTest } from '../../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import { RUN_TARGET_FIELD } from '../../../handlers/unit_test/shared/runTarget';

const GROUP_WORDS = "the ABAP Unit tests of the module's whole function group";

describe('a function module run covers its function group', () => {
  it('RunFunctionModuleUnitTest says so for its default runner', () => {
    assert.ok(
      RunFunctionModuleUnitTest.description.includes(
        'Runs the ABAP Unit tests of the function group holding a function module',
      ),
      RunFunctionModuleUnitTest.description,
    );
    assert.equal(
      RunFunctionModuleUnitTest.inputSchema.shape.function_module_name
        .description,
      'Function module whose function group the tests run for.',
    );
  });

  it('a run target of type FUNC says so (RunAbapUnit, HandlerUnitTestRun)', () => {
    const type = RUN_TARGET_FIELD.shape.type.description ?? '';
    assert.ok(type.includes(`FUNC runs ${GROUP_WORDS}.`), type);
  });

  it("RunAbapUnit's description says so for a function module", () => {
    assert.ok(
      RunAbapUnit.description.includes("function module's group"),
      RunAbapUnit.description,
    );
  });

  for (const tool of [HandlerUnitTestRun]) {
    it(`${tool.name}'s description says so for FUNC`, () => {
      assert.ok(
        tool.description.includes(
          `FUNC a function module, whose run covers ${GROUP_WORDS}`,
        ),
        tool.description,
      );
    });
  }
});
