/**
 * Unit test: verifies the default duplicate-suppression behavior of
 * `EmbeddableMcpServer`.
 *
 * When both the `readonly` and `high` sets are exposed, a readonly `Read<X>`
 * handler and a high-level `Get<X>` handler can refer to the same operation
 * (e.g. ReadProgram vs GetProgram). By default the server must suppress the
 * `Read<X>` duplicate so consumers (e.g. cloud-llm-hub) get a single,
 * deterministic tool per operation. Consumers can opt out by passing
 * `new NoDedupStrategy()`.
 *
 * No SAP connection is needed: handler registration is lazy (wrapper lambdas
 * call getConnection() only at invocation time), so a dummy connection object
 * is sufficient to inspect the registered tool set.
 *
 * Run: npm test -- --testPathPatterns=unit/embeddableDedupDefault
 */

import { NoDedupStrategy } from '../../lib/handlers/groups/strategies/index';
import { EmbeddableMcpServer } from '../../server/EmbeddableMcpServer';

type RegisteredToolsMap = Record<string, unknown>;

function getRegisteredToolNames(server: EmbeddableMcpServer): Set<string> {
  const tools = (server as unknown as { _registeredTools: RegisteredToolsMap })
    ._registeredTools;
  return new Set(Object.keys(tools || {}));
}

const dummyConnection = {} as never;

describe('EmbeddableMcpServer default Read/Get dedup', () => {
  const ORIGINAL_SAP_SYSTEM_TYPE = process.env.SAP_SYSTEM_TYPE;

  beforeAll(() => {
    // Program tools are onprem/legacy-only; force onprem so Get/ReadProgram register.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });

  afterAll(() => {
    if (ORIGINAL_SAP_SYSTEM_TYPE === undefined) {
      delete process.env.SAP_SYSTEM_TYPE;
    } else {
      process.env.SAP_SYSTEM_TYPE = ORIGINAL_SAP_SYSTEM_TYPE;
    }
  });

  test('readonly+high hides Read<X> when Get<X> is present (default)', () => {
    const server = new EmbeddableMcpServer({
      connection: dummyConnection,
      exposition: ['readonly', 'high'],
      systemType: 'onprem',
    });

    const names = getRegisteredToolNames(server);

    // Get<X> from the high group wins...
    expect(names.has('GetProgram')).toBe(true);
    expect(names.has('GetClass')).toBe(true);
    expect(names.has('GetTable')).toBe(true);
    // ...and the readonly Read<X> duplicate is suppressed by default.
    expect(names.has('ReadProgram')).toBe(false);
    expect(names.has('ReadClass')).toBe(false);
    expect(names.has('ReadTable')).toBe(false);
  });

  test('readonly-only keeps Read<X> (no overriding group)', () => {
    const server = new EmbeddableMcpServer({
      connection: dummyConnection,
      exposition: ['readonly'],
      systemType: 'onprem',
    });

    const names = getRegisteredToolNames(server);

    expect(names.has('ReadProgram')).toBe(true);
    expect(names.has('GetProgram')).toBe(false);
  });

  test('explicit NoDedupStrategy opts out — both Read and Get exposed', () => {
    const server = new EmbeddableMcpServer({
      connection: dummyConnection,
      exposition: ['readonly', 'high'],
      systemType: 'onprem',
      readOnlyDedupStrategy: new NoDedupStrategy(),
    });

    const names = getRegisteredToolNames(server);

    expect(names.has('GetProgram')).toBe(true);
    expect(names.has('ReadProgram')).toBe(true);
  });
});
