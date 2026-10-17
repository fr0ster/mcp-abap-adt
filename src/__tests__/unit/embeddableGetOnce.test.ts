/**
 * `EmbeddableMcpServer` lists each object read once: `Get<Type>` is a copy in
 * readonly and high, so readonly+high registers it once (from high) and
 * readonly alone registers it from readonly; no `Read<Type>` is registered.
 *
 * No SAP connection is needed: handler registration is lazy, so a dummy
 * connection object is enough to inspect the registered tool set.
 */

import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { NoDedupStrategy } from '../../lib/handlers/groups/strategies/index';

function registeredToolNames(server: EmbeddableMcpServer): string[] {
  return Object.keys(
    (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools ?? {},
  );
}

const READS = ['GetProgram', 'GetClass', 'GetTable', 'GetFunctionModule'];

describe('EmbeddableMcpServer serves Get<Type> once, and no Read<Type>', () => {
  it.each([
    ['readonly+high, default strategy', ['readonly', 'high'], undefined],
    [
      'readonly+high, NoDedupStrategy',
      ['readonly', 'high'],
      new NoDedupStrategy(),
    ],
    ['readonly alone', ['readonly'], undefined],
  ] as const)('%s', (_name, exposition, strategy) => {
    const server = new EmbeddableMcpServer({
      connection: {} as never,
      exposition: [...exposition],
      systemType: 'onprem',
      readOnlyDedupStrategy: strategy,
    });
    const names = registeredToolNames(server);
    for (const tool of READS) {
      expect(names.filter((n) => n === tool)).toHaveLength(1);
    }
    expect(names.filter((n) => /^Read(?!Transport)/.test(n))).toEqual([]);
  });
});
