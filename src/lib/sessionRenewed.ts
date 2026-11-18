/**
 * What a call's answer says when the call ran once more after SAP ended its
 * session (the one repeat, `BaseMcpServer`'s dispatch, 24.0.1): the
 * answer is the repeat's, with one field beside it, `session_renewed`, in
 * fixed words — none of SAP's (the owner, 2026-11-18: a repeated call is
 * never silent).
 */
import { parseJson } from './json';
import { isElement } from './thrownValue';

/** The words of `session_renewed`. */
export const SESSION_RENEWED_WORDS =
  'SAP ended the previous session; the call ran in a new one. A lock taken in the previous session, if any, is released; lock again before writing.';

/** An answer's content, as the dispatch hands it to the client. */
type TextContent = { type: 'text'; text: string }[];

/**
 * `content` with `session_renewed` beside the answer: a JSON object's
 * field; any other answer (a text, a list) becomes `result` beside it.
 */
export function withSessionRenewed(content: TextContent): TextContent {
  const [first, ...rest] = content;
  const parsed = first === undefined ? undefined : parseJson(first.text);
  const answer =
    parsed !== undefined && isElement(parsed)
      ? { ...parsed, session_renewed: SESSION_RENEWED_WORDS }
      : {
          ...(first === undefined ? {} : { result: parsed ?? first.text }),
          session_renewed: SESSION_RENEWED_WORDS,
        };
  return [{ type: 'text', text: JSON.stringify(answer, null, 2) }, ...rest];
}

/**
 * The words of a call that was to run once more, whose new session could
 * not be had (its logon refused or failed): no second run began.
 */
export const SESSION_RENEWAL_FAILED_WORDS =
  'SAP ended the session before the call ran, and the logon of a new session failed; the call did not run.';

/** The answer of a call whose new session could not be had: the server's words, no SAP text. */
export function sessionRenewalFailed(): {
  isError: true;
  content: TextContent;
} {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: 'session_renewal_failed',
            message: SESSION_RENEWAL_FAILED_WORDS,
          },
          null,
          2,
        ),
      },
    ],
  };
}
