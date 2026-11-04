/** Run by `runReport.test.ts` through Jest's `runCLI`: the test misses its `expect.assertions` count. */
import { liveCall } from '../../../../integration/helpers/live';
import { useStubRunner } from './runner';

useStubRunner();

it('calls and makes fewer assertions than it states', async () => {
  expect.assertions(2);
  await liveCall('GetDomain', { domain_name: 'ZDOM_MISSED' });
  expect(1).toBe(1);
});
