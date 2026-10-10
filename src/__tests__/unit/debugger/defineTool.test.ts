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

describe('defineTool', () => {
  it('answers the definition and the handler as an entry', () => {
    const entry = defineTool(Wait, handleDebugWait);
    expect(entry.toolDefinition).toBe(Wait);
    expect(entry.handler).toBe(handleDebugWait);
  });

  it('refuses, at compile time, a handler that takes other arguments', () => {
    // DebugWait's schema gives no name and no value; this handler needs both.
    // @ts-expect-error the handler disagrees with the schema
    defineTool(Wait, handleDebugSetVariable);

    // A declared type the handler does not take: value is a string.
    const numeric = async (_c: HandlerContext, _a: { value: number }) =>
      undefined;
    // @ts-expect-error the handler disagrees with the schema
    defineTool(SetVariable, numeric);

    // The right pairing compiles.
    defineTool(SetVariable, handleDebugSetVariable);
    expect(true).toBe(true);
  });
});
