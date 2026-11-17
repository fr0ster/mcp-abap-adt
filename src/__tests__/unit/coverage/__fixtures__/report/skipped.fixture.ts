/** Run by `runReport.test.ts`: a suite that skips, its call never made. */
import { describe, it } from 'node:test';
import { liveCall } from '../../../../integration/helpers/live';
import { stubSuite } from './runner';

stubSuite('skipped', () => {
  describe('a skipped suite', { skip: true }, () => {
    it('would call', async () => {
      await liveCall('GetDataElement', { data_element_name: 'ZDTEL_SKIPPED' });
    });
  });
});
