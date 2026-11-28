/**
 * Hard mode behaves as on main (#394, second review): its live steps are
 * judged by `isError`, a success answer is returned as it is, and a recorded
 * delete whose send throws keeps its record for the leftovers report.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { succeeded } from '../../integration/coverage/ownObjects';
import {
  deleteRecorded,
  type LiveAnswer,
  leftovers,
  livePrepare,
  recordCreated,
  resetLiveRecords,
  useLiveRunner,
} from '../../integration/helpers/live';

let dir: string;
const saved: Record<string, string | undefined> = {};

before(() => {
  for (const key of ['MCP_TEST_CONFIG', 'MCP_ABAP_ADT_COVERAGE_RUN']) {
    saved[key] = process.env[key];
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-hard-'));
  const config = path.join(dir, 'test-config.yaml');
  fs.writeFileSync(
    config,
    [
      'environment:',
      '  system_type: onprem',
      '  integration_hard_mode:',
      '    enabled: true',
      '',
    ].join('\n'),
  );
  process.env.MCP_TEST_CONFIG = config;
});

beforeEach(() => {
  const run = fs.mkdtempSync(path.join(dir, 'run-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = run;
  resetLiveRecords();
});

afterEach(() => useLiveRunner(undefined));

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

const unlockCut: LiveAnswer = (() => {
  const text = JSON.stringify({
    result: 'SUCCESS',
    cleanup: {
      left_locked: true,
      lock_handle: 'LEFT',
      failures: [{ connection_cause: 'ECONNRESET' }],
    },
  });
  return { isError: false, content: [{ type: 'text', text }], text };
})();

function runner(call: () => Promise<LiveAnswer>) {
  useLiveRunner({
    system: 'onprem',
    user: 'U',
    connection: () => ({}) as IAbapConnection,
    call,
    close: async () => {},
  });
}

describe('hard mode, as on main', () => {
  it('a success answer is returned as it is', async () => {
    runner(async () => unlockCut);
    const answer = await livePrepare('UpdateClass', { class_name: 'Z' });
    assert.equal(succeeded('UpdateClass', answer), answer);
  });

  it('a recorded delete whose send throws keeps its record', async () => {
    runner(async () => {
      throw new Error('the MCP server went away');
    });
    recordCreated('DeleteClass', { class_name: 'ZCL_KEEP' });
    await assert.rejects(deleteRecorded(), /went away/);
    assert.deepEqual(leftovers(), [
      'object DeleteClass {"class_name":"ZCL_KEEP"}',
    ]);
  });
});
