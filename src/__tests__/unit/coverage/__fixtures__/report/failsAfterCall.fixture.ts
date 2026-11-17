/** Run by `runReport.test.ts`: the call succeeds, the test then fails. */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('failsAfterCall', () => {
  it('calls and then fails', async () => {
    await liveCall('GetClass', { class_name: 'ZFAILS' });
    assert.equal(1, 2);
  });
});
