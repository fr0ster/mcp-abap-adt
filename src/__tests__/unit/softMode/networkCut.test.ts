/**
 * The live run's network cut (#394, spec §8): inactive unless both
 * variables are set; a value that is not valid refused; the cut starts at
 * the first held lock of the named test, once, ends after the given
 * milliseconds, and both are reported.
 */
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { describe, it } from 'node:test';
import {
  armNetworkCut,
  networkCutPlan,
} from '../../integration/helpers/networkCut';

describe('networkCutPlan', () => {
  it('neither set: no plan', () => {
    assert.equal(networkCutPlan({}), undefined);
  });

  it('both set: the plan', () => {
    assert.deepEqual(
      networkCutPlan({
        MCP_TEST_NETWORK_CUT_MS: '5000',
        MCP_TEST_NETWORK_CUT_AT: 'suite > case',
      }),
      { ms: 5000, at: 'suite > case' },
    );
  });

  it('one without the other, or a duration that is not a positive whole number, is refused', () => {
    assert.throws(() => networkCutPlan({ MCP_TEST_NETWORK_CUT_MS: '5000' }));
    assert.throws(() => networkCutPlan({ MCP_TEST_NETWORK_CUT_AT: 'x' }));
    for (const ms of ['0', '-1', '1.5', 'five', '']) {
      assert.throws(
        () =>
          networkCutPlan({
            MCP_TEST_NETWORK_CUT_MS: ms,
            MCP_TEST_NETWORK_CUT_AT: 'x',
          }),
        /not a positive whole number/,
        ms,
      );
    }
  });
});

describe('armNetworkCut', () => {
  it('inactive: nothing is listened to and nothing patched', () => {
    const before = http.Agent.prototype.createConnection;
    let listened = false;
    assert.equal(
      armNetworkCut({}, () => {
        listened = true;
      }),
      false,
    );
    assert.equal(listened, false);
    assert.equal(http.Agent.prototype.createConnection, before);
  });

  it('cuts at the first held lock of the named test, once, and ends after the duration', async () => {
    const before = http.Agent.prototype.createConnection;
    let onHeld: (() => void) | undefined;
    let name = 'another test';
    const lines: string[] = [];
    armNetworkCut(
      { MCP_TEST_NETWORK_CUT_MS: '30', MCP_TEST_NETWORK_CUT_AT: 'the test' },
      (listener) => {
        onHeld = listener;
      },
      (line) => lines.push(line),
      () => name,
    );
    onHeld?.();
    assert.equal(lines.length, 0, 'not in another test');
    assert.equal(http.Agent.prototype.createConnection, before);
    name = 'the test';
    onHeld?.();
    onHeld?.();
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /start .* in "the test" for 30 ms/);
    assert.notEqual(http.Agent.prototype.createConnection, before);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(lines.length, 2);
    assert.match(lines[1] ?? '', /end /);
    assert.equal(http.Agent.prototype.createConnection, before);
  });
});
