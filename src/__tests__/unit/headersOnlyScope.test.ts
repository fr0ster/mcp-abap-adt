/**
 * http/sse take request values only from headers (D26 D2), and an explicit
 * debugger option beats the environment (D6). A request scope made from
 * headers states every key — an absent header is an absent value — so the
 * process's `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_DEBUG_*` are not
 * read for it; outside a scope (stdio) the environment still answers. The
 * breakpoint conflict: the header, then the embedder's option, then the
 * environment (stdio only).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  resolveBreakpointConflict,
  statedDebuggerIds,
} from '../../lib/debugger/ids';
import {
  requestContextFromHeaders,
  runWithRequestContext,
} from '../../lib/requestContext';
import {
  getStatedSystemContext,
  resetSystemContextCache,
  systemContextFromConfiguration,
} from '../../lib/systemContext';
import { assertMatchObject } from '../helpers/assertions';

const KEYS = [
  'SAP_RESPONSIBLE',
  'SAP_MASTER_SYSTEM',
  'SAP_DEBUG_TERMINAL_ID',
  'SAP_DEBUG_IDE_ID',
  'SAP_DEBUG_BREAKPOINT_CONFLICT',
] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.SAP_RESPONSIBLE = 'PROCESS_USER';
  process.env.SAP_MASTER_SYSTEM = 'PRC';
  process.env.SAP_DEBUG_TERMINAL_ID = 'PROCESS_TERMINAL';
  process.env.SAP_DEBUG_IDE_ID = 'PROCESS_IDE';
  process.env.SAP_DEBUG_BREAKPOINT_CONFLICT = 'refuse-if-held';
  resetSystemContextCache();
  systemContextFromConfiguration();
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetSystemContextCache();
});

const inRequest = <T>(headers: Record<string, string>, fn: () => T): T =>
  runWithRequestContext(requestContextFromHeaders(headers), fn);

describe('a request without the headers (http/sse)', () => {
  it('has no responsible and no master system, not the process values', () => {
    const stated = inRequest({}, () => getStatedSystemContext());
    assert.equal(stated.responsible, undefined);
    assert.equal(stated.masterSystem, undefined);
  });

  it('has no debugger ids from the environment', () => {
    assert.deepStrictEqual(
      inRequest({}, () => statedDebuggerIds()),
      {},
    );
  });

  it('takes the breakpoint conflict from the option, never the environment', () => {
    assert.equal(
      inRequest({}, () => resolveBreakpointConflict()),
      'replace',
    );
    assert.equal(
      inRequest({}, () => resolveBreakpointConflict('refuse-if-held')),
      'refuse-if-held',
    );
  });
});

describe('a request with the headers', () => {
  it('takes each value from its header', () => {
    const headers = {
      'x-sap-responsible': 'HEADER_USER',
      'x-sap-master-system': 'HDR',
      'x-sap-debug-terminal-id': 'HEADER_TERMINAL',
      'x-sap-debug-ide-id': 'HEADER_IDE',
      'x-sap-debug-breakpoint-conflict': 'replace',
    };
    inRequest(headers, () => {
      assertMatchObject(getStatedSystemContext(), {
        responsible: 'HEADER_USER',
        masterSystem: 'HDR',
      });
      assert.deepStrictEqual(statedDebuggerIds(), {
        terminalId: 'HEADER_TERMINAL',
        ideId: 'HEADER_IDE',
      });
      // The header beats the option.
      assert.equal(resolveBreakpointConflict('refuse-if-held'), 'replace');
    });
  });
});

describe('outside a request scope (stdio)', () => {
  it('the environment answers', () => {
    assertMatchObject(getStatedSystemContext(), {
      responsible: 'PROCESS_USER',
      masterSystem: 'PRC',
    });
    assert.deepStrictEqual(statedDebuggerIds(), {
      terminalId: 'PROCESS_TERMINAL',
      ideId: 'PROCESS_IDE',
    });
  });

  it('the breakpointConflict option beats SAP_DEBUG_BREAKPOINT_CONFLICT', () => {
    assert.equal(resolveBreakpointConflict('replace'), 'replace');
  });

  it('with no option, SAP_DEBUG_BREAKPOINT_CONFLICT answers', () => {
    assert.equal(resolveBreakpointConflict(), 'refuse-if-held');
  });
});
