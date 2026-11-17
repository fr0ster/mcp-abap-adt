/** Run by `runReport.test.ts`: the test makes fewer assertions than its plan states. */
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('planMissed', () => {
  it('calls and makes fewer assertions than it plans', async (t) => {
    t.plan(2);
    await liveCall('GetDomain', { domain_name: 'ZDOM_MISSED' });
    t.assert.equal(1, 1);
  });
});
