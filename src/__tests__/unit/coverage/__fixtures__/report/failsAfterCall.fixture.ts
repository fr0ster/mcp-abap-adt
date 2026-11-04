/** Run by `runReport.test.ts` through Jest's `runCLI`: the call succeeds, the test then fails. */
import { liveCall } from '../../../../integration/helpers/live';
import { useStubRunner } from './runner';

useStubRunner();

it('calls and then fails', async () => {
  await liveCall('GetClass', { class_name: 'ZFAILS' });
  expect(1).toBe(2);
});
