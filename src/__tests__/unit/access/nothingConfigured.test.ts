/**
 * Nothing configured, nothing changes (plan Task 12): no row read gives no
 * denied action, no list and no strategy; a registry built with no denied
 * action lists the same definitions as one built without the argument, for
 * every set, with the data tools served and not; and a server with no
 * strategy builds no `AccessCall` across one call of every sample call of
 * the batch proof (`batchEntryCases.ts`). The requests every tool sends are
 * pinned by their own suites, unchanged.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { compactToolSet } from '../../../../compact/src/launcher';
import * as checkedArguments from '../../../lib/access/checkedArguments';
import { accessChecksFor } from '../../../lib/access/packageTreeAccessChecks';
import { readAccessRestrictions } from '../../../lib/config/accessRestrictions';
import {
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ToolSet,
} from '../../../lib/toolSet';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';
import { inProcessServer } from '../../helpers/pinServer';

afterEach(() => {
  mock.restoreAll();
});

/** Every definition a registry lists, by tool name. */
function definitionsOf(
  toolSet: ToolSet,
  transport: 'stdio' | 'http',
  dataTools: boolean,
  denied?: [],
) {
  const registry =
    denied === undefined
      ? registryOf(toolSet, transport, { dataTools })
      : registryOf(toolSet, transport, { dataTools }, denied);
  return registry
    .getHandlerGroups()
    .flatMap((group) => group.getHandlers())
    .map((entry) => JSON.stringify(entry.toolDefinition));
}

describe('nothing configured', () => {
  it('reads no restriction from no row', () => {
    assert.deepEqual(readAccessRestrictions([], {}, null), {
      deniedActions: [],
      lists: {},
    });
  });

  it('builds no strategy from no list', () => {
    assert.equal(accessChecksFor({}), undefined);
  });

  for (const [name, toolSet] of [
    ['full', fullToolSet],
    ['core-ro', fullReadOnlyToolSet],
    ['compact', compactToolSet],
  ] as const) {
    for (const transport of ['stdio', 'http'] as const) {
      for (const dataTools of [true, false]) {
        it(`${name} over ${transport}, data tools ${dataTools ? 'served' : 'not served'}: no denied action lists the same definitions`, () => {
          const without = definitionsOf(toolSet, transport, dataTools);
          assert.ok(without.length > 0);
          assert.deepEqual(
            definitionsOf(toolSet, transport, dataTools, []),
            without,
          );
        });
      }
    }
  }

  it('builds no AccessCall across every sample call, with no strategy', async () => {
    const built = mock.method(checkedArguments, 'accessCallOf');
    const server = await inProcessServer('onprem', {
      settings: {
        url: 'http://127.0.0.1:9',
        client: '100',
        authType: 'basic',
        username: 'NOBODY',
      },
      credential: new BasicAuthProvider('NOBODY', 'never-sent'),
    });
    try {
      const listed = new Set(await server.listed());
      let called = 0;
      for (const sample of BATCH_ENTRY_CASES) {
        if (!listed.has(sample.tool)) continue;
        // The connection is unreachable: each call fails on its connection,
        // after the point where a strategy would have been asked.
        await server.call(sample.tool, sample.args);
        called += 1;
      }
      assert.ok(called > 100, `only ${called} sample calls were listed`);
    } finally {
      await server.close();
    }
    assert.equal(built.mock.callCount(), 0);
  });
});
