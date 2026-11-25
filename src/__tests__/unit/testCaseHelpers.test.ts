/**
 * The live harness reads a test case for its data and decides in code where
 * it runs (`configHelpers.getTestCase`, `servedHere.notServedReason`):
 *
 * - `getTestCase` answers a case whatever its `enabled` and `available_in`
 *   say: neither turns it off any more.
 * - A case the config does not hold is `null`, and the tester skips naming
 *   its key (`<handler>.test_cases[name=<case>]`).
 * - `notServedReason` names why a tool is not tested on the configured
 *   system: one whose operations cloud's ADT type table does not serve
 *   (CreateProgram, decided before its `available_in`) says so; one the table
 *   serves and its `available_in` leaves cloud out of
 *   (RuntimeGetGatewayErrorLog) names its `available_in`; a tool cloud
 *   serves gets none.
 *
 * The config is a file of this test's own, named by `MCP_TEST_CONFIG` before
 * anything reads it (the harness reads it once per process): a cloud system,
 * hard mode on so the tester reads no session.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { getTestCase } from '../integration/helpers/configHelpers';
import { notServedReason } from '../integration/helpers/servedHere';
import { LambdaTester } from '../integration/helpers/testers/LambdaTester';

const CONFIG = `
environment:
  system_type: cloud
  integration_hard_mode:
    enabled: true
create_class:
  test_cases:
    - name: switched_off
      enabled: false
      available_in: ["onprem"]
      params:
        class_name: ZCL_SWITCHED_OFF
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-case-helpers-'));
const file = path.join(dir, 'test-config.yaml');
fs.writeFileSync(file, CONFIG);
process.env.MCP_TEST_CONFIG = file;

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A tester whose skip reason the test can read. */
class SkipReading extends LambdaTester {
  get skipReason(): string | undefined {
    return this.configSkip;
  }
}

describe('the test-case helpers', () => {
  it('getTestCase answers a case its enabled and available_in would have turned off', () => {
    assert.deepEqual(getTestCase('create_class', 'switched_off')?.params, {
      class_name: 'ZCL_SWITCHED_OFF',
    });
  });

  it('a case the config does not hold is null, and the tester skips naming its key', async () => {
    assert.equal(getTestCase('create_class', 'absent'), null);
    const tester = new SkipReading('create_class', 'absent', 'helpers-test');
    await tester.init();
    assert.equal(
      tester.skipReason,
      'the test config has no create_class.test_cases[name=absent]',
    );
  });

  it('notServedReason names why cloud does not serve a tool, and nothing for one it serves', () => {
    assert.equal(
      notServedReason('CreateProgram'),
      'CreateProgram is not served on cloud (its ADT type table serves no operation it needs)',
    );
    assert.equal(
      notServedReason('GetEnhancementImpl'),
      'GetEnhancementImpl is not served on cloud (available_in: onprem)',
    );
    assert.equal(notServedReason('SearchSource'), undefined);
  });
});
