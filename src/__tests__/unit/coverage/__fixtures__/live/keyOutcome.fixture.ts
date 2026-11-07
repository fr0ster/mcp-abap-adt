/**
 * Run by `live.test.ts` through Jest's `runCLI`, never by `npm test`: one
 * test calls and passes, one calls and then fails an assertion.
 */
import {
  type LiveRunner,
  liveCall,
  useLiveRunner,
} from '../../../../integration/helpers/live';

const run: unknown = Reflect.get(globalThis, 'COVERAGE_RUN');
if (typeof run === 'string') process.env.MCP_ABAP_ADT_COVERAGE_RUN = run;

const runner: LiveRunner = {
  system: 'onprem',
  user: 'STUB_USER',
  call: async () => ({ isError: false, content: [], text: '' }),
  connection: () => {
    throw new Error('no connection in this fixture');
  },
  close: async () => {},
};

beforeAll(() => useLiveRunner(runner));

it('calls and passes', async () => {
  await liveCall('GetProgram', { program_name: 'ZPASSES' });
  expect(1).toBe(1);
});

it('calls and then fails', async () => {
  await liveCall('GetClass', { class_name: 'ZFAILS' });
  expect(1).toBe(2);
});
