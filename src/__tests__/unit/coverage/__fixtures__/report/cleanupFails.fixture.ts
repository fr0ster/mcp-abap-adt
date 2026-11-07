/** Run by `runReport.test.ts` through Jest's `runCLI`: the body passes, its afterEach cleanup fails. */
import { liveCall } from '../../../../integration/helpers/live';
import { useStubRunner } from './runner';

useStubRunner();

afterEach(() => {
  throw new Error('the cleanup failed');
});

it('calls and passes, its cleanup fails', async () => {
  await liveCall('GetInterface', { interface_name: 'ZIF_CLEANUP' });
  expect(1).toBe(1);
});
