/**
 * The in-process server the live suites run a restriction on (plan Task 14,
 * Step 1b): with nothing configured it lists exactly the tools it listed
 * before the restriction option existed; a denied tool is left out and
 * nothing else moves. Nothing is sent: listing tools takes no connection.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import {
  inProcessServer,
  type PinServer,
  type ServerRestriction,
  type ServerSource,
} from '../../helpers/pinServer';
import type { SystemKind } from '../../helpers/servedTools';

/** A source no request ever reaches: listing tools connects nowhere. */
const unreachable: ServerSource = {
  settings: {
    url: 'http://127.0.0.1:9',
    client: '100',
    authType: 'basic',
    username: 'NOBODY',
  },
  credential: new BasicAuthProvider('NOBODY', 'never-sent'),
};

for (const variant of [
  'onprem',
  'cloud',
] as const satisfies readonly SystemKind[]) {
  describe(`the in-process server's restriction, ${variant}`, () => {
    const servers: PinServer[] = [];
    const start = async (restriction?: ServerRestriction) => {
      const server = await inProcessServer(
        variant,
        unreachable,
        undefined,
        restriction,
      );
      servers.push(server);
      return server;
    };
    let plain: string[] = [];

    before(async () => {
      plain = await (await start()).listed();
    });

    after(async () => {
      for (const server of servers) await server.close();
    });

    it('lists the same tools with nothing configured as without the option', async () => {
      assert.ok(plain.includes('DeleteClass'));
      assert.deepEqual(await (await start({})).listed(), plain);
      assert.deepEqual(
        await (await start({ deniedActions: [] })).listed(),
        plain,
      );
    });

    it('leaves a denied tool out and nothing else', async () => {
      const listed = await (
        await start({
          deniedActions: [parseDeniedEntry('DeleteClass', 'test')],
        })
      ).listed();
      assert.deepEqual(
        listed,
        plain.filter((name) => name !== 'DeleteClass'),
      );
    });
  });
}
