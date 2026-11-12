/** Run by `runReport.test.ts`: the file's process ends in the middle of a case, after its call. */
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('crash', () => {
  it('calls, then its process ends', async () => {
    await liveCall('GetPackage', { package_name: 'ZCRASH' });
    process.exit(0);
  });
});
