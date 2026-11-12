/**
 * Shared steps for the unit-test integration suites: call a tool (through MCP
 * in hard mode, the handler otherwise), fail on a refusal naming the tool, and
 * read a run's answer.
 */

import assert from 'node:assert/strict';
import type { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import {
  createHandlerContext,
  extractErrorMessage,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

type Response = {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
};
type Handler = (context: any, args: any) => Promise<unknown>;

export function stepsFor(tester: LambdaTester, context: LambdaTesterContext) {
  const handlerContext = () =>
    createHandlerContext({
      connection: context.connection,
      logger: context.logger as any,
    });

  /** One tool call; a refusal throws with the tool's own message. */
  async function step(
    tool: string,
    args: Record<string, unknown>,
    handler: Handler,
  ): Promise<Response> {
    context.logger?.info?.(`   • ${tool}`);
    const response = (await tester.invokeToolOrHandler(tool, args, () =>
      handler(handlerContext(), args),
    )) as Response;
    if (response.isError) {
      throw new Error(`${tool} failed: ${extractErrorMessage(response)}`);
    }
    return response;
  }

  /** A cleanup call: a refusal is logged, never thrown. */
  async function cleanup(
    tool: string,
    args: Record<string, unknown>,
    handler: Handler,
  ): Promise<void> {
    try {
      const response = (await tester.invokeToolOrHandler(tool, args, () =>
        handler(handlerContext(), args),
      )) as Response;
      if (response.isError) {
        context.logger?.warn?.(
          `cleanup ${tool} (ignored): ${extractErrorMessage(response)}`,
        );
      }
    } catch (error: any) {
      context.logger?.warn?.(
        `cleanup ${tool} (ignored): ${error?.message ?? String(error)}`,
      );
    }
  }

  return { step, cleanup, handlerContext };
}

/**
 * A Run* tool's answer: the run finished, every expected test method is in
 * its result, and no test raised an alert.
 */
export function expectTestsRan(response: Response, expected: string[]): void {
  const data = parseHandlerResponse(response);
  assert.equal(data.finished, true);
  const result = JSON.stringify(data.run_result ?? '').toUpperCase();
  for (const method of expected) {
    assert.ok(result.includes(method.toUpperCase()), method);
  }
  assert.equal(hasAlertKey(result), false, result);
}

/** A word character, as a JSON key's namespace prefix spells it. */
const WORD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

/**
 * Whether JSON `text` (upper case) holds an `ALERT` key — `"ALERT":` or
 * `"<prefix>:ALERT":`, white space before the colon allowed. Plain code.
 */
export function hasAlertKey(text: string): boolean {
  for (
    let at = text.indexOf('ALERT"');
    at >= 0;
    at = text.indexOf('ALERT"', at + 1)
  ) {
    let after = at + 'ALERT"'.length;
    while (after < text.length && ' \t\n\r'.includes(text[after] ?? ''))
      after += 1;
    if (text[after] !== ':') continue;
    let before = at - 1;
    if (text[before] === ':') {
      before -= 1;
      const end = before;
      while (before >= 0 && WORD.includes(text[before] ?? '')) before -= 1;
      if (before === end) continue;
    }
    if (text[before] === '"') return true;
  }
  return false;
}
