/** Run by `runReport.test.ts` through Jest's `runCLI`: a call whose test passes. */
import { liveCall } from '../../../../integration/helpers/live';
import { useStubRunner } from './runner';

useStubRunner();

it('calls and passes', async () => {
  await liveCall('GetProgram', { program_name: 'ZPASSES' });
  expect(1).toBe(1);
});
