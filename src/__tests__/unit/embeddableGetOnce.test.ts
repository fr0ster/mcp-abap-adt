/**
 * `EmbeddableMcpServer` lists each object read once: `Get<Type>` is a copy in
 * readonly and high, so readonly+high registers it once (from high) and
 * readonly alone registers it from readonly; no `Read<Type>` is registered.
 *
 * No SAP connection is needed: handler registration is lazy, so a dummy
 * connection object is enough to inspect the registered tool set.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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
  for (const [_name, exposition, strategy] of [
    ['readonly+high, default strategy', ['readonly', 'high'], undefined],
    [
      'readonly+high, NoDedupStrategy',
      ['readonly', 'high'],
      new NoDedupStrategy(),
    ],
    ['readonly alone', ['readonly'], undefined],
  ] as const) {
    it(format('%s', _name), () => {
      const server = new EmbeddableMcpServer({
        connection: {} as never,
        exposition: [...exposition],
        systemType: 'onprem',
        ...(strategy !== undefined && { readOnlyDedupStrategy: strategy }),
      });
      const names = registeredToolNames(server);
      for (const tool of READS) {
        assert.equal(names.filter((n) => n === tool).length, 1);
      }
      assert.deepStrictEqual(
        names.filter((n) => /^Read(?!Transport)/.test(n)),
        [],
      );
    });
  }
});
