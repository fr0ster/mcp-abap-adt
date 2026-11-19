/**
 * `defineTool` pairs a definition with its handler under the compiler: a
 * handler whose arguments disagree with the definition's schema does not
 * compile (`npm run test:check`, and ts-jest's own type check).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handleDebugSetVariable,
  TOOL_DEFINITION as SetVariable,
} from '../../../handlers/debugger/debug/handleDebugSetVariable';
import {
  handleDebugWait,
  TOOL_DEFINITION as Wait,
} from '../../../handlers/debugger/debug/handleDebugWait';
import type { HandlerContext } from '../../../handlers/interfaces';
import { defineTool } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { assertRejects } from '../../helpers/assertions';

const RAN = { content: [{ type: 'text', text: 'ran' }] };

describe('defineTool', () => {
  it('answers the definition and the handler as an entry', () => {
    const entry = defineTool(Wait, handleDebugWait);
    assert.equal(entry.toolDefinition, Wait);
  });

  it("calls the handler with the arguments as the definition's schema parses them", async () => {
    const seen: unknown[] = [];
    const entry = defineTool(Wait, async (_context, args) => {
      seen.push(args);
      return RAN;
    });
    assert.equal(
      await entry.call(noConnectionContext(), { state_handle: 'h', extra: 1 }),
      RAN,
    );
    assert.deepStrictEqual(seen, [
      { state_handle: 'h', hold_seconds: 10, detail: 'terse' },
    ]);
  });

  it('refuses arguments the schema does not parse, naming the tool, and the handler does not run', async () => {
    const seen: unknown[] = [];
    const entry = defineTool(Wait, async (_context, args) => {
      seen.push(args);
      return RAN;
    });
    await assertRejects(
      entry.call(noConnectionContext(), { hold_seconds: 'long' }),
      'Input validation error: Invalid arguments for tool DebugWait',
    );
    assert.deepStrictEqual(seen, []);
  });

  it('refuses, at compile time, a handler that takes other arguments', () => {
    // DebugWait's schema gives no name and no value; this handler needs both.
    // @ts-expect-error the handler disagrees with the schema
    defineTool(Wait, handleDebugSetVariable);

    // A declared type the handler does not take: value is a string.
    const numeric = async (_c: HandlerContext, _a: { value: number }) => RAN;
    // @ts-expect-error the handler disagrees with the schema
    defineTool(SetVariable, numeric);

    // The right pairing compiles.
    defineTool(SetVariable, handleDebugSetVariable);
    assert.equal(true, true);
  });

  it('refuses, at compile time, a handler whose answer is not a tool result', () => {
    // @ts-expect-error a handler answers a tool result, not a bare value
    defineTool(Wait, async () => 'ran');
    defineTool(Wait, async () => RAN);
    assert.equal(true, true);
  });
});
