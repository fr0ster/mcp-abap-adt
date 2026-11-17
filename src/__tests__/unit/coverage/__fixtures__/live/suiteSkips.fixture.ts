/**
 * Run by `live.test.ts` through `node --test` with a test config that names
 * no system kind, or a kind the suite does not name: the suite skips with
 * its reason before its case, which would otherwise call.
 */
import { it } from 'node:test';
import { liveCall, liveSuite } from '../../../../integration/helpers/live';

liveSuite(['onprem'], 'a suite that skips', () => {
  it('the case', async () => {
    console.log('the case ran');
    await liveCall('GetProgram', { program_name: 'ZSKIPS' });
  });
});
