/**
 * Locks before the policy (#394, spec §4): a failed test whose objects the
 * YAML keeps still has every `held` lock released, once, before the policy
 * returns; a lock whose unlock was already sent is not sent again; nothing
 * is sent after a credential refusal.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { heldLocksOf } from '../../integration/helpers/heldLiveLocks';
import { markCredentialRefused } from '../../integration/helpers/refusalGuard';
import { LambdaTester } from '../../integration/helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../integration/helpers/testers/types';

let dir: string;
const saved: Record<string, string | undefined> = {};

before(() => {
  for (const key of ['MCP_TEST_CONFIG', 'MCP_ABAP_ADT_COVERAGE_RUN']) {
    saved[key] = process.env[key];
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locks-before-policy-'));
  const config = path.join(dir, 'test-config.yaml');
  // A failed test keeps its objects: cleanup_on_failure is not set.
  fs.writeFileSync(
    config,
    ['environment:', '  system_type: onprem', 'test_settings: {}', ''].join(
      '\n',
    ),
  );
  process.env.MCP_TEST_CONFIG = config;
});

beforeEach(() => {
  const run = fs.mkdtempSync(path.join(dir, 'run-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = run;
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

const lines: string[] = [];
const logger = {
  info: () => {},
  warn: (line: string) => lines.push(line),
  error: (line: string) => lines.push(line),
  debug: () => {},
  success: () => {},
} as unknown as LambdaTesterContext['logger'];

/** A tester whose test failed, on `connection`, with a cleanup that deletes. */
class FailedTester extends LambdaTester {
  deleted = 0;
  constructor(connection: IAbapConnection) {
    super('create_class', 'probe', 'probe');
    this.testCase = { name: 'probe', params: {} };
    this.testFailed = true;
    this.cleanupAfterLambda = async () => {
      this.deleted += 1;
    };
    this.context = {
      hasConfig: true,
      connection,
      session: { session_id: 's', session_state: { cookies: '' } },
      logger,
      isCloudSystem: false,
      params: {},
      packageName: '$TMP',
      cleanupAfter: async () => {},
      testCase: this.testCase,
    };
  }
}

const connection = (): IAbapConnection => ({}) as IAbapConnection;
const lock = (handle: string) => ({
  object_type: 'CLASS',
  object_name: `ZCL_${handle}`,
  lock_handle: handle,
});

describe('LambdaTester releases locks before the delete policy', () => {
  it('a failed test that keeps its objects still releases its held lock, once', async () => {
    const run = connection();
    let sent = 0;
    heldLocksOf(run).hold(lock('A'), async () => {
      sent += 1;
      return { text: 'unlocked' };
    });
    const tester = new FailedTester(run);
    await tester.afterEach();
    await tester.afterEach();
    assert.equal(sent, 1);
    assert.equal(tester.deleted, 0, 'the policy still withholds the delete');
    assert.equal(heldLocksOf(run).stillHeld.length, 0);
  });

  it('a lock whose unlock was sent is not sent again, and is reported', async () => {
    const run = connection();
    let sent = 0;
    heldLocksOf(run).hold(lock('B'), async () => {
      sent += 1;
      return { text: 'unlocked' };
    });
    heldLocksOf(run).unlockSent('B');
    lines.length = 0;
    await new FailedTester(run).afterEach();
    assert.equal(sent, 0);
    assert.match(lines.join('\n'), /ZCL_B/);
  });

  it('nothing is sent after a credential refusal', async () => {
    const run = connection();
    let sent = 0;
    heldLocksOf(run).hold(lock('C'), async () => {
      sent += 1;
      return { text: 'unlocked' };
    });
    markCredentialRefused();
    lines.length = 0;
    await new FailedTester(run).afterEach();
    assert.equal(sent, 0);
    assert.match(lines.join('\n'), /credential refusal.*ZCL_C/);
  });
});

describe("a failed test's warning says what happens to its objects", () => {
  it('a suite that deletes in its own after is not said to keep them', async () => {
    const tester = new FailedTester(connection());
    tester.deletesInItsOwnAfter();
    lines.length = 0;
    await tester.afterEach();
    assert.equal(
      tester.deleted,
      0,
      'the after-each delete still follows the policy',
    );
    assert.match(
      lines.join('\n'),
      /the suite deletes its objects in its own after hook/,
    );
    assert.doesNotMatch(lines.join('\n'), /kept for analysis/);
  });

  it('any other suite keeps them for analysis, and says so', async () => {
    const tester = new FailedTester(connection());
    lines.length = 0;
    await tester.afterEach();
    assert.match(lines.join('\n'), /kept for analysis/);
  });
});
