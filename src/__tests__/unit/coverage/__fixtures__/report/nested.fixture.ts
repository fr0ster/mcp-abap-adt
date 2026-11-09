/**
 * Run by `runReport.test.ts`: a case two `describe`s deep inside its suite.
 * Its call is logged under `t.fullName`; it fails unless the current test
 * `liveCall` read is exactly that name path, so the reporter's join of the
 * rebuilt path is the same string.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  callLog,
  liveCall,
  runningTest,
} from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('nested', () => {
  describe('one', () => {
    describe('two', () => {
      it('deep case', async (t) => {
        await liveCall('GetFunctionGroup', { function_group_name: 'ZDEEP' });
        assert.equal(runningTest()?.test, t.fullName);
        assert.equal(callLog().at(-1)?.test, t.fullName);
      });
    });
  });
});
