/**
 * The file's logoff (#394, spec §6): sent once per connection; a soft-mode
 * run connection that still owns something fails the file and names what is
 * left, whether its logoff threw, was not confirmed, or was withheld after a
 * credential refusal; a connection with no record only warns.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { heldLocksOf } from '../../integration/helpers/heldLiveLocks';
import {
  closeTrackedConnections,
  endTestConnection,
  logoffStateOf,
  trackConnection,
} from '../../integration/helpers/openConnections';
import { markCredentialRefused } from '../../integration/helpers/refusalGuard';

let runDir: string;
let saved: string | undefined;
let warn: ReturnType<typeof mock.method>;

beforeEach(() => {
  saved = process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-logoff-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  warn = mock.method(console, 'warn', () => {});
});

afterEach(() => {
  warn.mock.restore();
  if (saved === undefined) delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  else process.env.MCP_ABAP_ADT_COVERAGE_RUN = saved;
  fs.rmSync(runDir, { recursive: true, force: true });
});

function connection(disconnect: () => Promise<void> = async () => {}) {
  return {
    disconnect: mock.fn(disconnect),
    flushGoodbye: mock.fn(async () => {}),
  };
}

const holdingALock = (c: object) =>
  heldLocksOf(c).hold({
    object_type: 'CLASS',
    object_name: 'ZCL_LEFT',
    lock_handle: 'H',
  });

describe("the file's logoff", () => {
  it('a run connection that owns a lock and whose logoff throws fails the file, naming the lock', async () => {
    const c = connection(async () => {
      throw new Error('ECONNREFUSED');
    });
    holdingALock(c);
    trackConnection(c);
    await assert.rejects(closeTrackedConnections(), (error: Error) => {
      assert.match(error.message, /logoff failed/);
      assert.match(error.message, /lock CLASS ZCL_LEFT \(held\)/);
      return true;
    });
    assert.equal(logoffStateOf(c), 'logoff-threw');
  });

  it('an explicit end that threw is still reported by the file close, and not sent again', async () => {
    const c = connection(async () => {
      throw new Error('ECONNRESET');
    });
    holdingALock(c);
    trackConnection(c);
    await assert.rejects(endTestConnection(c));
    await assert.rejects(closeTrackedConnections(), /logoff failed/);
    assert.equal(c.disconnect.mock.callCount(), 1);
  });

  it('after a credential refusal nothing is sent, and a lock still owned fails the file', async () => {
    const c = connection();
    holdingALock(c);
    trackConnection(c);
    markCredentialRefused();
    await assert.rejects(
      closeTrackedConnections(),
      /logoff not sent: a credential was refused.*ZCL_LEFT/,
    );
    assert.equal(c.disconnect.mock.callCount(), 0);
    assert.equal(logoffStateOf(c), 'logoff-withheld');
  });

  it('a logoff that resolved is reported "not confirmed", never as done', async () => {
    const c = connection();
    holdingALock(c);
    trackConnection(c);
    await assert.rejects(closeTrackedConnections(), /logoff not confirmed/);
    assert.equal(logoffStateOf(c), 'logoff-unconfirmed');
  });

  it('a run connection that owns nothing passes', async () => {
    const c = connection();
    heldLocksOf(c);
    trackConnection(c);
    await closeTrackedConnections();
    assert.equal(c.disconnect.mock.callCount(), 1);
  });

  it('a connection with no record (hard mode) only warns when its logoff throws', async () => {
    const c = connection(async () => {
      throw new Error('ECONNREFUSED');
    });
    trackConnection(c);
    await closeTrackedConnections();
    assert.equal(warn.mock.callCount(), 1);
  });

  it('a logoff is sent once across an explicit end and the file close (characterization)', async () => {
    const c = connection();
    trackConnection(c);
    await endTestConnection(c);
    await closeTrackedConnections();
    assert.equal(c.disconnect.mock.callCount(), 1);
  });
});
