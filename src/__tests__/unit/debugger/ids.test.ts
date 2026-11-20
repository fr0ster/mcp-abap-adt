import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { readDestinationSystemContext } from '../../../../server-runtime/src/stdio/auth/destinationStores';
import {
  newDebuggerId,
  resolveBreakpointConflict,
  resolveDebuggerIds,
  statedDebuggerIds,
} from '../../../lib/debugger/ids';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '../../../lib/requestContext';
import { withDestinationSystemContext } from '../../../lib/requestSystemResolution';
import { assertThrows } from '../../helpers/assertions';

describe('debugger ids', () => {
  it('generates 32 upper-case hex characters, different each time', () => {
    const a = newDebuggerId();
    assert.match(a, /^[0-9A-F]{32}$/);
    assert.notEqual(newDebuggerId(), a);
  });
  it('takes each id from the environment on its own', () => {
    assert.deepStrictEqual(statedDebuggerIds({ SAP_DEBUG_IDE_ID: 'IDE1' }), {
      ideId: 'IDE1',
    });
    assert.deepStrictEqual(statedDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }), {
      terminalId: 'T1',
    });
    assert.deepStrictEqual(statedDebuggerIds({}), {});
  });
  it('a request from headers takes each id from its header only: the environment answers neither (D26 D2)', () => {
    runWithRequestContext(
      requestContextFromHeaders({ 'x-sap-debug-ide-id': 'FROMHEADER' }),
      () => {
        assert.deepStrictEqual(
          statedDebuggerIds({
            SAP_DEBUG_IDE_ID: 'FROMENV',
            SAP_DEBUG_TERMINAL_ID: 'T',
          }),
          { ideId: 'FROMHEADER' },
        );
      },
    );
  });
  it('resolves: stated where given, random elsewhere, and says whether any was stated', () => {
    const r = resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' });
    assert.equal(r.terminalId, 'T1');
    assert.match(r.ideId, /^[0-9A-F]{32}$/);
    assert.equal(r.stated, true);
    assert.equal(resolveDebuggerIds({}).stated, false);
  });
});

describe('the terminal id and the breakpoint conflict, as stated', () => {
  it('a configured terminal id replaces the random one; none configured is random, never missing', () => {
    assert.equal(
      resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }).terminalId,
      'T1',
    );
    assert.match(
      resolveDebuggerIds({ SAP_DEBUG_IDE_ID: 'I1' }).terminalId,
      /^[0-9A-F]{32}$/,
    );
  });

  it('says whether the terminal id itself was stated: only then can a terminal-mode predecessor exist', () => {
    assert.equal(
      resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }).terminalStated,
      true,
    );
    assert.equal(
      resolveDebuggerIds({ SAP_DEBUG_IDE_ID: 'I1' }).terminalStated,
      false,
    );
  });

  it('the conflict: replace by default; the environment under the embedder, under the request scope (D26 D6)', () => {
    assert.equal(resolveBreakpointConflict(undefined, {}), 'replace');
    assert.equal(
      resolveBreakpointConflict('refuse-if-held', {}),
      'refuse-if-held',
    );
    assert.equal(
      resolveBreakpointConflict('refuse-if-held', {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
      }),
      'refuse-if-held',
    );
    assert.equal(
      resolveBreakpointConflict(undefined, {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'refuse-if-held',
      }),
      'refuse-if-held',
    );
    runWithRequestContext(
      requestContextFromHeaders({
        'x-sap-debug-breakpoint-conflict': 'refuse-if-held',
      }),
      () =>
        assert.equal(
          resolveBreakpointConflict('replace', {
            SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
          }),
          'refuse-if-held',
        ),
    );
  });

  it("a destination's .env states it, and a header wins over it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-conflict-'));
    try {
      const file = path.join(dir, 'destination.env');
      fs.writeFileSync(file, 'SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held\n');
      const stated = readDestinationSystemContext(file);
      assert.equal(stated.debugBreakpointConflict, 'refuse-if-held');
      withDestinationSystemContext(stated, () =>
        assert.equal(
          resolveBreakpointConflict(undefined, {}),
          'refuse-if-held',
        ),
      );
      runWithRequestContext(
        requestContextFromHeaders({
          'x-sap-debug-breakpoint-conflict': 'replace',
        }),
        () =>
          withDestinationSystemContext(stated, () =>
            assert.equal(resolveBreakpointConflict(undefined, {}), 'replace'),
          ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a value it does not know, naming both it knows', () => {
    assertThrows(
      () =>
        resolveBreakpointConflict(undefined, {
          SAP_DEBUG_BREAKPOINT_CONFLICT: 'merge',
        }),
      'SAP_DEBUG_BREAKPOINT_CONFLICT: merge is neither replace nor refuse-if-held',
    );
  });
});
