/**
 * What the live suites of the access restrictions assert on a call: the
 * answer succeeded, or it was refused by the listed schema's parse with
 * nothing sent on the suite's connection.
 */

import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type LiveAnswer,
  liveConnection,
  livePrepare,
  type ToolArgs,
} from './live';

/** The answer, or the case fails naming the step and what SAP answered. */
export function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text.slice(0, 800)}`);
  return answer;
}

/** A member of the answer's JSON payload; `undefined` when there is none. */
export function answerField(answer: LiveAnswer, key: string): unknown {
  try {
    const parsed: unknown = JSON.parse(answer.text);
    return typeof parsed === 'object' && parsed !== null
      ? Reflect.get(parsed, key)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The answer of `tool`, and the requests the suite's connection sent meanwhile. */
export async function sentDuring(
  tool: string,
  args: ToolArgs,
): Promise<{ answer: LiveAnswer; sent: string[] }> {
  const target: IAbapConnection = liveConnection();
  const original = target.makeAdtRequest.bind(target);
  const sent: string[] = [];
  const spy = mock.method(
    target,
    'makeAdtRequest',
    (request: Parameters<IAbapConnection['makeAdtRequest']>[0]) => {
      sent.push(`${request.method} ${request.url.split('?')[0] ?? ''}`);
      return original(request);
    },
  );
  try {
    return { answer: await livePrepare(tool, args), sent };
  } finally {
    spy.mock.restore();
  }
}

/** The call is refused by the schema's parse: an error naming its arguments, nothing sent. */
export async function refusedAtParse(
  tool: string,
  args: ToolArgs,
): Promise<void> {
  const { answer, sent } = await sentDuring(tool, args);
  assert.equal(
    answer.isError,
    true,
    `${tool} ran: ${answer.text.slice(0, 300)}`,
  );
  assert.ok(
    answer.text.includes(`Invalid arguments for tool ${tool}`),
    answer.text.slice(0, 300),
  );
  assert.deepEqual(sent, []);
}
