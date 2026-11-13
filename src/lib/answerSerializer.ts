/**
 * The one contract that turns a value of any type into a tool's answer: its
 * text is the value as JSON. A serializer takes whatever
 * it is handed, by design, so its `payload` is `unknown`; the unknown audit
 * names this contract among its sinks (`SINK_CONTRACTS`).
 *
 * Each answer family implements it for its own answer type and layout
 * (`answer.ts`, the background-run and the leftover-session answers, two
 * spaces indented; GetEnhancements' compact text).
 */
export interface IAnswerSerializer<A> {
  /** `payload` as the answer's text; `isError` where the answer says so. */
  json(payload: unknown, isError?: boolean): A;
}
