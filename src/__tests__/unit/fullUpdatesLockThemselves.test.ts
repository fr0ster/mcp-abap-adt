/**
 * `UpdateBehaviorDefinition` and `UpdateMetadataExtension` on the shipped
 * full set lock, write and unlock themselves (#4, review round 1): no tool of
 * the full set issues a lock handle, so neither declares `lock_handle`, and
 * each call is its own lock, write and unlock, then the wait for the write.
 * Compact `HandlerUpdate` keeps its write under a held lock.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { declareSystemKind } from '../../lib/systemKind';
import { fullToolSet } from '../../lib/toolSet';
import { recordingConnection } from '../helpers/recordingConnection';

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';

/** The shipped full set's entry `name` on `transport`. */
function fullEntry(name: string, transport: 'stdio' | 'http'): HandlerEntry {
  const entry = fullToolSet
    .groups(noConnectionContext(), transport, { dataTools: false })
    .flatMap((group) => group.getHandlers())
    .find((each) => each.toolDefinition.name === name);
  if (entry === undefined) throw new Error(`the full set serves no ${name}`);
  return entry;
}

const CASES: ReadonlyArray<[string, string, string]> = [
  [
    'UpdateBehaviorDefinition',
    'ZBP_A',
    '/sap/bc/adt/bo/behaviordefinitions/zbp_a',
  ],
  ['UpdateMetadataExtension', 'ZC_A', '/sap/bc/adt/ddic/ddlx/sources/zc_a'],
];

for (const [tool, name, uri] of CASES) {
  describe(format('%s on the full set', tool), () => {
    for (const transport of ['stdio', 'http'] as const) {
      it(format('declares no lock_handle (%s)', transport), () => {
        const shape = Object.keys(
          fullEntry(tool, transport).toolDefinition.inputSchema.shape,
        );
        assert.ok(shape.includes('source_code'));
        assert.ok(!shape.includes('lock_handle'));
      });
    }

    it('locks, writes and unlocks itself, then waits for the write', async () => {
      process.env.SAP_SYSTEM_TYPE = 'onprem';
      const connection = recordingConnection();
      declareSystemKind(connection, 'onprem');
      const answered = await fullEntry(tool, 'stdio').call(
        { connection },
        { name, source_code: 'placeholder source', activate: false },
      );
      assert.ok(!JSON.stringify(answered).includes('"isError":true'));
      assert.deepStrictEqual(
        connection.requests.map((r) => `${r.method} ${r.url}`),
        [
          `POST ${uri}?_action=LOCK&accessMode=MODIFY`,
          `PUT ${uri}/source/main?lockHandle=${HANDLE}`,
          `POST ${uri}?_action=UNLOCK&lockHandle=${HANDLE}`,
          `GET ${uri}/source/main?version=inactive&withLongPolling=true`,
        ],
      );
    });
  });
}
