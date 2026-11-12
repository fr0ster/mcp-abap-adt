/**
 * The stub live suite the report fixtures run in: `liveDescribe` with a
 * runner whose every call answers an empty success, so nothing is sent. The
 * run's directory comes from the test that runs the fixtures
 * (`MCP_ABAP_ADT_COVERAGE_RUN` in the fixture's environment).
 */
import {
  type LiveRunner,
  liveDescribe,
} from '../../../../integration/helpers/live';

const runner: LiveRunner = {
  system: 'onprem',
  user: 'STUB_USER',
  call: async () => ({ isError: false, content: [], text: '' }),
  connection: () => {
    throw new Error('no connection in this fixture');
  },
  close: async () => {},
};

/** A live suite on the stub runner. */
export function stubSuite(title: string, body: () => void): void {
  liveDescribe(
    title,
    async () => runner,
    async () => {},
    body,
  );
}
