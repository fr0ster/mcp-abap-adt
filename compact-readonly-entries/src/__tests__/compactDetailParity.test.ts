/**
 * Compact parity (terse answers, step 6): a compact tool that reads through
 * a changed full tool hands it the level asked and answers what it answers,
 * at every `detail`. `HandlerGet` (contents, main programs, transports) and
 * `HandlerDumpList` are pinned beside their own cases; this file holds the
 * profiler trace list.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import * as traceFiles from '../../../src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles';

const calls: unknown[] = [];

// Replaced on the module that defines it, before the facade loads (it binds
// the reader through lib's read barrel, whose getters read this module).
mock.method(
  traceFiles,
  'handleRuntimeListProfilerTraceFiles',
  async (_context: unknown, args: unknown) => {
    calls.push(args);
    return {
      isError: false,
      content: [{ type: 'text', text: `traces at ${JSON.stringify(args)}` }],
    };
  },
);

import { defineTool } from '@mcp-abap-adt/lib/handlers';
import {
  handleHandlerProfileList,
  TOOL_DEFINITION as ProfileList,
} from '../handlers/handleHandlerProfileList';

describe('HandlerProfileList answers RuntimeListProfilerTraceFiles at every detail', () => {
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`detail ${detail}`, async () => {
      calls.length = 0;
      const answered = await defineTool(
        ProfileList,
        handleHandlerProfileList,
      ).call({ connection: {}, logger: undefined } as never, { detail });
      assert.deepStrictEqual(calls, [{ detail }]);
      assert.deepStrictEqual(answered, {
        isError: false,
        content: [
          { type: 'text', text: `traces at ${JSON.stringify({ detail })}` },
        ],
      });
    });
  }

  it('terse by default', async () => {
    calls.length = 0;
    await defineTool(ProfileList, handleHandlerProfileList).call(
      { connection: {}, logger: undefined } as never,
      {},
    );
    assert.deepStrictEqual(calls, [{ detail: 'terse' }]);
  });
});
