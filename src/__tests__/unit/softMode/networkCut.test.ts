/**
 * The live run's network cut (#394, spec §8): inactive unless both
 * variables are set; a value that is not valid refused; the cut starts at
 * the first held lock of the named test, once, ends once the given number of
 * connections were refused (no timer), and both are reported.
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
        MCP_TEST_NETWORK_CUT_REQUESTS: '5000',
        MCP_TEST_NETWORK_CUT_AT: 'suite > case',
      }),
      { refused: 5000, at: 'suite > case' },
    );
  });

  it('one without the other, or a duration that is not a positive whole number, is refused', () => {
    assert.throws(() =>
      networkCutPlan({ MCP_TEST_NETWORK_CUT_REQUESTS: '5000' }),
    );
    assert.throws(() => networkCutPlan({ MCP_TEST_NETWORK_CUT_AT: 'x' }));
    for (const ms of ['0', '-1', '1.5', 'five', '']) {
      assert.throws(
        () =>
          networkCutPlan({
            MCP_TEST_NETWORK_CUT_REQUESTS: ms,
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

  it('cuts at the first held lock of the named test, once, and ends after the refused connections', () => {
    const before = http.Agent.prototype.createConnection;
    let onHeld: (() => void) | undefined;
    let name = 'another test';
    const lines: string[] = [];
    armNetworkCut(
      {
        MCP_TEST_NETWORK_CUT_REQUESTS: '2',
        MCP_TEST_NETWORK_CUT_AT: 'the test',
      },
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
    assert.match(lines[0] ?? '', /start .* in "the test", until 2 connection/);
    const agent = new http.Agent();
    /** A new socket through an agent, as the connection's transport opens one. */
    const refusedTarget = () => {
      const socket = agent.createConnection({ host: '127.0.0.1', port: 1 });
      socket?.on('error', () => {});
      socket?.destroy();
    };
    refusedTarget();
    assert.equal(lines.length, 1, 'still cut after one');
    refusedTarget();
    assert.equal(lines.length, 2);
    assert.match(lines[1] ?? '', /end .* after 2 refused/);
    assert.equal(http.Agent.prototype.createConnection, before);
  });
});
