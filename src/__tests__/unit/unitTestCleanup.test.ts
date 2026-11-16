/**
 * The unit-test suites' cleanup is part of the test
 * (`integration/high/unitTest/unitTestSteps.ts`, `cleanup`): the delete of
 * what the test created must succeed and the object must then read "not
 * found". A refused delete, an object that still reads, or a call that throws
 * is a `CleanupFailure`, and the tester (`LambdaTester.afterEach`) passes it
 * on so the test fails; any other cleanup error is still only logged.
 *
 * The config is a file of this test's own, named by `MCP_TEST_CONFIG` before
 * anything reads it: hard mode, so the tester reads no session; the tools are
 * the test's own handlers, called directly.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  CleanupFailure,
  LambdaTester,
} from '../integration/helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../integration/helpers/testers/types';
import { stepsFor } from '../integration/high/unitTest/unitTestSteps';

const CONFIG = `
environment:
  system_type: onprem
  default_package: $TMP
  integration_hard_mode:
    enabled: true
class_unit_test:
  test_cases:
    - name: cleanup_case
      params:
        class_name: ZCL_CLEANUP_CASE
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-test-cleanup-'));
const file = path.join(dir, 'test-config.yaml');
fs.writeFileSync(file, CONFIG);
process.env.MCP_TEST_CONFIG = file;

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A tester that calls each tool's handler directly and shows its context. */
class DirectTester extends LambdaTester {
  override async invokeToolOrHandler<T>(
    _toolName: string,
    _args: Record<string, unknown>,
    directCall: () => Promise<T>,
  ): Promise<T> {
    return directCall();
  }
  get shownContext(): LambdaTesterContext {
    if (this.context === undefined) throw new Error('not initialised');
    return this.context;
  }
}

const answer = (isError: boolean, text: string) => async () => ({
  isError,
  content: [{ type: 'text', text }],
});
const NOT_FOUND = answer(true, JSON.stringify({ status: 404 }));
const DELETED = answer(false, 'deleted');

async function cleanupWith(
  deleteHandler: () => Promise<unknown>,
  readHandler: () => Promise<unknown>,
): Promise<void> {
  const tester = new DirectTester(
    'class_unit_test',
    'cleanup_case',
    'cleanup-test',
  );
  await tester.init();
  await stepsFor(tester, tester.shownContext).cleanup(
    'DeleteClass',
    { class_name: 'ZCL_CLEANUP_CASE' },
    deleteHandler,
    {
      tool: 'GetClass',
      args: { class_name: 'ZCL_CLEANUP_CASE' },
      handler: readHandler,
    },
  );
}

describe('the unit-test suites’ cleanup', () => {
  it('a delete that succeeds and reads back "not found" passes', async () => {
    await cleanupWith(DELETED, NOT_FOUND);
  });

  it('a refused delete fails the test', async () => {
    await assert.rejects(cleanupWith(answer(true, 'locked'), NOT_FOUND), {
      message: 'cleanup DeleteClass was refused: locked',
    });
    await assert.rejects(
      cleanupWith(answer(true, 'locked'), NOT_FOUND),
      CleanupFailure,
    );
  });

  it('an object that still reads after its delete fails the test', async () => {
    await assert.rejects(
      cleanupWith(DELETED, answer(false, 'CLASS ZCL_CLEANUP_CASE')),
      (error: unknown) => {
        assert.ok(error instanceof CleanupFailure);
        assert.equal(
          error.message,
          'cleanup DeleteClass: GetClass still reads the object it deleted: CLASS ZCL_CLEANUP_CASE',
        );
        return true;
      },
    );
  });

  it('a read-back refused for another reason than "not found" fails the test', async () => {
    await assert.rejects(
      cleanupWith(DELETED, answer(true, JSON.stringify({ status: 500 }))),
      CleanupFailure,
    );
  });

  it('a call that throws fails the test', async () => {
    await assert.rejects(
      cleanupWith(async () => {
        throw new Error('connection lost');
      }, NOT_FOUND),
      CleanupFailure,
    );
  });

  it('the tester passes a CleanupFailure on from afterEach, and only logs any other cleanup error', async () => {
    const failing = new DirectTester(
      'class_unit_test',
      'cleanup_case',
      'cleanup-test',
    );
    await failing.beforeAll(
      async () => {},
      async () => {
        throw new CleanupFailure('still there');
      },
    );
    await assert.rejects(failing.afterEach(), CleanupFailure);

    const logging = new DirectTester(
      'class_unit_test',
      'cleanup_case',
      'cleanup-test',
    );
    await logging.beforeAll(
      async () => {},
      async () => {
        throw new Error('anything else');
      },
    );
    await logging.afterEach();
  });
});
