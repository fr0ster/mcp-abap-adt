/**
 * Compact parity (terse answers, step 6): `HandlerTransportCreate` is
 * `CreateTransport`, and hands it the level asked: the create answers what
 * the full tool answers at every `detail`.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import * as createTransport from '../../../src/handlers/transport/high/handleCreateTransport';

const calls: Array<Record<string, unknown>> = [];

// Replaced on the module that defines it, before the facade loads.
mock.method(
  createTransport,
  'handleCreateTransport',
  async (_context: unknown, args: Record<string, unknown>) => {
    calls.push(args);
    return {
      isError: false,
      content: [{ type: 'text', text: `created at ${String(args.detail)}` }],
    };
  },
);

import { defineTool } from '@mcp-abap-adt/lib/handlers';
import {
  handleHandlerTransportCreate,
  TOOL_DEFINITION as TransportCreate,
} from '../handlers/handleHandlerTransportCreate';

describe('HandlerTransportCreate answers CreateTransport at every detail', () => {
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`detail ${detail}`, async () => {
      calls.length = 0;
      const answered = await defineTool(
        TransportCreate,
        handleHandlerTransportCreate,
      ).call({ connection: {}, logger: undefined } as never, {
        description: 'x',
        detail,
      });
      assert.equal(calls[0]?.detail, detail);
      assert.deepStrictEqual(answered, {
        isError: false,
        content: [{ type: 'text', text: `created at ${detail}` }],
      });
    });
  }
});
