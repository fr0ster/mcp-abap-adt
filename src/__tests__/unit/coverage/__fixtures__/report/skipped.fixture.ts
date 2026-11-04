/** Run by `runReport.test.ts` through Jest's `runCLI`: a suite that skips, its call never made. */
import { liveCall } from '../../../../integration/helpers/live';
import { useStubRunner } from './runner';

useStubRunner();

describe.skip('a skipped suite', () => {
  it('would call', async () => {
    await liveCall('GetDataElement', { data_element_name: 'ZDTEL_SKIPPED' });
  });
});
