/**
 * `defineTool` pairs a definition with its handler under the compiler: a
 * handler whose arguments disagree with the definition's schema does not
 * compile (`npm run test:check`, and ts-jest's own type check).
 */
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

const RAN = { content: [{ type: 'text', text: 'ran' }] };

describe('defineTool', () => {
  it('answers the definition and the handler as an entry', () => {
    const entry = defineTool(Wait, handleDebugWait);
    expect(entry.toolDefinition).toBe(Wait);
  });

  it("calls the handler with the arguments as the definition's schema parses them", async () => {
    const seen: unknown[] = [];
    const entry = defineTool(Wait, async (_context, args) => {
      seen.push(args);
      return RAN;
    });
    await expect(
      entry.call(noConnectionContext(), { state_handle: 'h', extra: 1 }),
    ).resolves.toBe(RAN);
    expect(seen).toEqual([
      { state_handle: 'h', hold_seconds: 10, detail: 'terse' },
    ]);
  });

  it('refuses arguments the schema does not parse, naming the tool, and the handler does not run', async () => {
    const seen: unknown[] = [];
    const entry = defineTool(Wait, async (_context, args) => {
      seen.push(args);
      return RAN;
    });
    await expect(
      entry.call(noConnectionContext(), { hold_seconds: 'long' }),
    ).rejects.toThrow(
      'Input validation error: Invalid arguments for tool DebugWait',
    );
    expect(seen).toEqual([]);
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
    expect(true).toBe(true);
  });

  it('refuses, at compile time, a handler whose answer is not a tool result', () => {
    // @ts-expect-error a handler answers a tool result, not a bare value
    defineTool(Wait, async () => 'ran');
    defineTool(Wait, async () => RAN);
    expect(true).toBe(true);
  });
});
