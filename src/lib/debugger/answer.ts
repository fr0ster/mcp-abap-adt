import type { McpResult } from '../answer';
import type { IAnswerSerializer } from '../answerSerializer';
import { type DetailArgs, detailOf } from '../strategies/detail';
import { return_error } from '../utils';
import type { AmdpState } from './AmdpSession';
import type { DebugExtra } from './access';
import { terseAmdpEvent } from './amdpReadings';
import type {
  BreakpointsAnswer,
  DebugState,
  DebugView,
  OnceStep,
} from './DebugSession';
import type { DebugFailure } from './failures';
import { terseSettings, terseStop } from './readings';

/** A debugger answer's text block: a string as it is, any other value as JSON. */
const textBlocks: IAnswerSerializer<{ type: 'text'; text: string }> = {
  json<P>(value: P) {
    return {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value),
    };
  },
};

/**
 * terse / full / raw of one reading. `extraOf` — the handle and the SAP ids a
 * start answers — joins every detail: merged into terse and full, and as a
 * block of its own beside SAP's document under raw, so no detail loses it.
 * `failureExtraOf` joins an error answer as a block of its own: a start that
 * failed but left something held answers the handle that stops it.
 */
export async function debugAnswer<T, P, F = T>(
  args: DetailArgs,
  work: () => Promise<DebugView<T>>,
  terse: (v: T) => P,
  full?: (v: T) => F,
  extraOf: () => DebugExtra = () => ({}),
  failureExtraOf: () => DebugExtra = () => ({}),
): Promise<McpResult> {
  try {
    const view = await work();
    const extra = extraOf();
    const hasExtra = Object.keys(extra).length > 0;
    const detail = detailOf(args);
    if (detail === 'raw') {
      return {
        isError: false,
        content: [
          textBlocks.json(view.raw),
          ...(hasExtra ? [textBlocks.json(extra)] : []),
        ],
      };
    }
    const projected =
      detail !== 'full'
        ? terse(view.value)
        : full === undefined
          ? view.value
          : full(view.value);
    const merged = !hasExtra
      ? projected
      : projected && typeof projected === 'object' && !Array.isArray(projected)
        ? { ...projected, ...extra }
        : { value: projected, ...extra };
    return { isError: false, content: [textBlocks.json(merged)] };
  } catch (error) {
    const failed = return_error(error);
    const extra = failureExtraOf();
    return Object.keys(extra).length > 0
      ? { ...failed, content: [...failed.content, textBlocks.json(extra)] }
      : failed;
  }
}

/** A step of the one-request and batch paths, terse: SAP's step result, or the end it reports. */
export const terseOnceStep = (v: OnceStep) =>
  'ended' in v ? { state: 'ended', reason: v.ended } : v.step;

/** A debug state: under terse a stop is its place and the top frames; raw is SAP's documents of the stop. */
export async function debugStateAnswer(
  args: DetailArgs,
  work: () => Promise<StartedState>,
  extraOf: () => DebugExtra = () => ({}),
  failureExtraOf: () => DebugExtra = () => ({}),
): Promise<McpResult> {
  return debugAnswer(
    args,
    async () => {
      const state = await work();
      const raw =
        state.state === 'stopped'
          ? [
              state.stop.raw.debuggee,
              state.stop.raw.attach,
              state.stop.raw.stack,
            ].join('\n')
          : JSON.stringify(state);
      return { value: state, raw };
    },
    terseDebugState,
    (s) => s,
    extraOf,
    failureExtraOf,
  );
}

/** A debug state, with the breakpoints a start placed beside it. */
export type StartedState = DebugState & {
  breakpoints?: BreakpointsAnswer | undefined;
};

/** A debug state under terse: a stop is its place and the top frames. */
export function terseDebugState(s: StartedState) {
  if (s.state !== 'stopped') return s;
  // Everything a start added beside the stop (breakpoints placed and refused, reconciliation) stays.
  const { stop, ...rest } = s;
  return {
    ...rest,
    ...terseStop(stop.debuggee, stop.stack, stop.attach),
    ...(stop.stackError ? { stack_error: stop.stackError } : {}),
    ...(stop.settings ? { settings: terseSettings(stop.settings) } : {}),
    ...(stop.settingsError ? { settings_error: stop.settingsError } : {}),
  };
}

/** An AMDP state under terse: each event read. */
export function terseAmdpState(s: AmdpState) {
  return s.state === 'event'
    ? { state: 'event' as const, events: s.events.map(terseAmdpEvent) }
    : s;
}

/** What an AMDP step answers: the state after it. */
export function amdpStepped(state: string) {
  return { state };
}

/** What a debug session's end answers: stopped, and each part that failed to undo. */
export function stoppedSession(notes: readonly DebugFailure[]) {
  return { state: 'stopped' as const, ...(notes.length ? { notes } : {}) };
}
