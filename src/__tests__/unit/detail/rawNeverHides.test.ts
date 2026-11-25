/**
 * Raw never hides an error (Codex round 5, P1-4): a call `full` refuses or
 * explains an error in is answered at `raw` the same way. Codex's case:
 * `feed_types: ['descriptors', 'variants']` with `runtime_error`, a dumps
 * filter neither feed takes — each feed's entry is its refusal.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleRuntimeListFeeds } from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import {
  createBatchAvailability,
  NO_BATCH_ENDPOINT_STATUS,
} from '../../../lib/batch/availability';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

async function at(detail: 'full' | 'raw') {
  const connection = recordingConnection([]);
  declareSystemKind(connection, 'onprem');
  const batchAvailability = createBatchAvailability();
  batchAvailability.noteOuterStatus(NO_BATCH_ENDPOINT_STATUS);
  const answered = await handleRuntimeListFeeds(
    { connection, logger: undefined, batchAvailability } as never,
    {
      feed_types: ['descriptors', 'variants'],
      runtime_error: 'DBSQL_SQL_ERROR',
      detail,
    } as never,
  );
  return { answered, sent: connection.requests.length };
}

describe('raw never hides an error', () => {
  it("feed_types with a filter no feed takes: raw answers full's refusals", async () => {
    const full = await at('full');
    const raw = await at('raw');
    assert.ok((full.answered.content[0]?.text ?? '').includes('"error"'));
    // Full's refusals, answered as an error (Codex round 9).
    assert.deepStrictEqual(raw.answered, { ...full.answered, isError: true });
    assert.equal(raw.sent, full.sent);
  });
});
