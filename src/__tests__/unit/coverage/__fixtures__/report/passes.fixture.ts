/** Run by `runReport.test.ts` through `node --test` with the ledger reporter: a call whose test passes. */
import { it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('passes', () => {
  it('calls and passes', async () => {
    await liveCall('GetProgram', { program_name: 'ZPASSES' });
  });
});
