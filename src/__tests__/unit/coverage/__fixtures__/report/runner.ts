/**
 * The stub live runner the report fixtures use: every call answers an empty
 * success, nothing is sent. The run's directory comes from the test that
 * runs the fixtures (`globals.COVERAGE_RUN`).
 */
import {
  type LiveRunner,
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

export function useStubRunner(): void {
  beforeAll(() => useLiveRunner(runner));
}
