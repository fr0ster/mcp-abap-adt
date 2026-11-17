/** Run by `runReport.test.ts`: the body passes, its afterEach cleanup fails. */
import { afterEach, it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('cleanupFails', () => {
  afterEach(() => {
    throw new Error('the cleanup failed');
  });
  it('calls and passes, its cleanup fails', async () => {
    await liveCall('GetInterface', { interface_name: 'ZIF_CLEANUP' });
  });
});
