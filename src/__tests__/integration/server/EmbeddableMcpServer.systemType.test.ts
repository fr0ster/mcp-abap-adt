/**
 * Integration test: verifies that the `systemType` option on
 * `EmbeddableMcpServer` correctly overrides `process.env.SAP_SYSTEM_TYPE`
 * at registration time, so tools with `available_in: ['onprem', 'legacy']`
 * are included or excluded per instance — independent of the process-global
 * env var.
 *
 * Uses a real ABAP connection (from .env / auth broker) to prove the option
 * works in a realistic embedder scenario, even though the filter itself
 * doesn't touch the connection.
 *
 * Run: npm test -- --testPathPattern=integration/server
 */

import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { getTimeout, loadTestEnv } from '../helpers/configHelpers';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';

type RegisteredToolsMap = Record<string, unknown>;

function getRegisteredToolNames(server: EmbeddableMcpServer): Set<string> {
  const tools = (server as unknown as { _registeredTools: RegisteredToolsMap })
    ._registeredTools;
  return new Set(Object.keys(tools || {}));
}

describe('EmbeddableMcpServer systemType option (real connection)', () => {
  // Read after the test env is loaded: it states the configured system type
  // once per process, so a value read earlier is `undefined` and `afterEach`
  // would delete the configured one.
  let ORIGINAL_SAP_SYSTEM_TYPE: string | undefined;

  beforeAll(async () => {
    await loadTestEnv();
    ORIGINAL_SAP_SYSTEM_TYPE = process.env.SAP_SYSTEM_TYPE;
  });

  afterEach(() => {
    if (ORIGINAL_SAP_SYSTEM_TYPE === undefined) {
      delete process.env.SAP_SYSTEM_TYPE;
    } else {
      process.env.SAP_SYSTEM_TYPE = ORIGINAL_SAP_SYSTEM_TYPE;
    }
  });

  test(
    'systemType="onprem" registers onprem-only tools (CreateProgram etc.)',
    async () => {
      const { connection } = await createTestConnectionAndSession();
      process.env.SAP_SYSTEM_TYPE = 'cloud';

      const server = new EmbeddableMcpServer({
        connection,
        exposition: ['high'],
        systemType: 'onprem',
      });

      const names = getRegisteredToolNames(server);

      expect(names.has('CreateProgram')).toBe(true);
      expect(names.has('UpdateProgram')).toBe(true);
      expect(names.has('DeleteProgram')).toBe(true);
    },
    getTimeout('default'),
  );

  test(
    'systemType="cloud" filters out onprem-only tools despite env=onprem',
    async () => {
      const { connection } = await createTestConnectionAndSession();
      process.env.SAP_SYSTEM_TYPE = 'onprem';

      const server = new EmbeddableMcpServer({
        connection,
        exposition: ['high'],
        systemType: 'cloud',
      });

      const names = getRegisteredToolNames(server);

      expect(names.has('CreateProgram')).toBe(false);
      expect(names.has('UpdateProgram')).toBe(false);
      expect(names.has('DeleteProgram')).toBe(false);
    },
    getTimeout('default'),
  );

  test(
    'no systemType option → falls back to SAP_SYSTEM_TYPE env var',
    async () => {
      const { connection } = await createTestConnectionAndSession();
      process.env.SAP_SYSTEM_TYPE = 'onprem';

      const server = new EmbeddableMcpServer({
        connection,
        exposition: ['high'],
      });

      const names = getRegisteredToolNames(server);

      expect(names.has('CreateProgram')).toBe(true);
    },
    getTimeout('default'),
  );
});
