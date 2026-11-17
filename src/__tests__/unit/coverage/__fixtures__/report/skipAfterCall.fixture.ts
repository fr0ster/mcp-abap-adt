/** Run by `runReport.test.ts`: a case that skips itself after its call. */
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('skipAfterCall', () => {
  it('calls, then skips', async (t) => {
    await liveCall('GetView', { view_name: 'ZSKIP' });
    t.skip('after the call');
  });
});
