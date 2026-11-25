/**
 * How an abapGit tool answers (spec §5.3, §6): the facts its reading kept,
 * nothing else, written once and minified.
 *
 * - A success is the answer the tool's formatter wrote from the typed facts
 *   (`formats.ts`): text, TSV or minified JSON — nothing is cut.
 * - A failure is the `IAbapGitStructuredError` adt-clients built: its fixed
 *   `message` and its `facts` (`status`, `messageClass`, `messageNumber`,
 *   `gitHttpStatus`), copied field by field, as minified JSON. No SAP text,
 *   body, header or request reaches it.
 * - A throw is the server's refusal when it is one (a `ServerRefusal`, a
 *   chain refusal), else fixed words naming the tool — never the thrown
 *   value's message.
 *
 * `unlink` is not answered here: it keeps the existing member and the
 * ordinary ADT error path (`answer` of `../answer`).
 */

import type {
  IAbapGitErrorFacts,
  IAbapGitStructuredError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { McpResult } from '../answer';
import { answerRead } from '../auth/answerFailure';
import { failureOf } from '../auth/failures';
import type { AnswerDetail } from '../strategies/projections';

/** The context an abapGit answer names: the tool, and the level asked for. */
export interface AbapGitAnswerContext {
  readonly tool: string;
  /**
   * The level the call asked for. The answer's shape is chosen before the
   * call by the formatter (`answerAt`); it is named here for the wiring.
   */
  readonly detail: AnswerDetail;
}

/** The fixed words of a throw that is no refusal: nothing of the thrown value. */
export const ABAPGIT_THREW_WORDS =
  'the abapGit call failed in this server before SAP answered; nothing of the failure is shown, since it could carry what SAP was sent';

function text(value: string, isError: boolean): McpResult {
  return { isError, content: [{ type: 'text', text: value }] };
}

/** An error's facts, field by field: only the kept ones. */
function factsOf(facts: IAbapGitErrorFacts): IAbapGitErrorFacts {
  return {
    status: facts.status,
    ...(facts.messageClass !== undefined
      ? { messageClass: facts.messageClass }
      : {}),
    ...(facts.messageNumber !== undefined
      ? { messageNumber: facts.messageNumber }
      : {}),
    ...(facts.gitHttpStatus !== undefined
      ? { gitHttpStatus: facts.gitHttpStatus }
      : {}),
  };
}

/** A structured error as its answer: the fixed message and the facts, minified. */
export function abapGitFailure(error: IAbapGitStructuredError): McpResult {
  return text(
    JSON.stringify({ message: error.message, facts: factsOf(error.facts) }),
    true,
  );
}

/** A throw as its answer: the refusal it is, else fixed words. */
export function abapGitThrown(
  thrown: unknown,
  ctx: AbapGitAnswerContext,
): McpResult {
  const read = failureOf(thrown);
  if (read !== undefined) return answerRead(read);
  return text(
    JSON.stringify({
      error: 'abapgit_failed',
      tool: ctx.tool,
      message: ABAPGIT_THREW_WORDS,
    }),
    true,
  );
}

/**
 * One abapGit call, answered: `call` sends it through a new form of
 * `AdtAbapGitClient`, `project` writes the answer from the facts the reading
 * kept.
 */
export async function answer<V>(
  ctx: AbapGitAnswerContext,
  call: () => Promise<IAdtResponse<V, IAbapGitStructuredError>>,
  project: (value: V) => string,
): Promise<McpResult> {
  try {
    const response = await call();
    if (!response.ok) return abapGitFailure(response.getError());
    return text(project(response.getResult().value), false);
  } catch (thrown) {
    return abapGitThrown(thrown, ctx);
  }
}
