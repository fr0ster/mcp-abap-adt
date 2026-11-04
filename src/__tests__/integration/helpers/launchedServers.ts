/**
 * Launched servers under the refusal stop (plan C2 Step 4a), with no test
 * hook in production code.
 *
 * A server the tests launch as a child (stdio, Streamable HTTP) is not
 * wrapped — its connections are its own. Instead:
 * 1. **Logged on first.** Immediately before a launch, the parent's own
 *    guarded connection with the same credentials logs on (`logOn`); a
 *    refusal there latches the marker, and nothing is launched.
 * 2. **Every child answer is read.** When an answer reports a credential
 *    refusal (as the server words it: `authentication_failed`, or a `401`
 *    SAP answered), the parent latches the marker, stops that child, and
 *    launches and sends nothing more.
 * 3. **The residual, stated openly.** Inside one child call, the child
 *    server's own follow-up (an UNLOCK after a failed write; its logoff when
 *    it is stopped) may still be sent once after the refusal: the parent
 *    cannot stop it without hooks in production code. It is an accepted
 *    residual, named in the PR description for the owner.
 */

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpResult } from '../../../lib/answer';
import type { ToolArgs } from '../../../lib/handlers/interfaces';
import {
  markCredentialRefused,
  refusalAnswered,
  refuseAfterMarker,
} from './refusalGuard';
import type { Launched } from './testers/hardMode';

/** A launched server whose answers the parent reads. */
export interface GuardedLaunch {
  /** Calls `tool`; a credential refusal answered latches the marker and stops the child. */
  call(tool: string, args: ToolArgs): Promise<McpResult>;
  close(): Promise<void>;
}

/** A tool call's answer as the MCP client declares it, read as a tool result. */
function resultOf(answer: unknown): McpResult {
  const result = CallToolResultSchema.parse(answer);
  return {
    isError: result.isError === true,
    content: result.content.flatMap((item) =>
      item.type === 'text' ? [{ type: 'text' as const, text: item.text }] : [],
    ),
  };
}

/**
 * Launches a server once the parent's own connection logged on, and reads
 * each of its answers for a credential refusal.
 */
export async function launchGuarded(options: {
  /** The parent's own guarded logon with the same credentials. */
  logOn: () => Promise<void>;
  launch: () => Promise<Pick<Launched, 'client' | 'close'>>;
}): Promise<GuardedLaunch> {
  refuseAfterMarker('a launch');
  await options.logOn();
  refuseAfterMarker('a launch');
  const launched = await options.launch();
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await launched.close();
  };
  return {
    call: async (tool, args) => {
      refuseAfterMarker(tool);
      const answer = resultOf(
        await launched.client.callTool({ name: tool, arguments: { ...args } }),
      );
      const text = answer.content.map((item) => item.text).join('\n');
      if (refusalAnswered(answer.isError, text)) {
        markCredentialRefused();
        await stop();
      }
      return answer;
    },
    close: stop,
  };
}
