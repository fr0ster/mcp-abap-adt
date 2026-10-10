import type { McpResult } from '../answer';
import { detailOf } from '../strategies/detail';
import { return_error } from '../utils';
import type { DebugState, DebugView, StopView } from './DebugSession';
import { terseStop } from './readings';

const asText = (value: unknown) => ({
  type: 'text' as const,
  text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
});

/**
 * terse / full / raw of one reading. `extraOf` — the handle and the SAP ids a
 * start answers — joins every detail: merged into terse and full, and as a
 * block of its own beside SAP's document under raw, so no detail loses it.
 */
export async function debugAnswer<T>(
  args: unknown,
  work: () => Promise<DebugView<T>>,
  terse: (v: T) => unknown,
  full: (v: T) => unknown = (v) => v,
  extraOf: () => Record<string, unknown> = () => ({}),
): Promise<McpResult> {
  try {
    const view = await work();
    const extra = extraOf();
    const hasExtra = Object.keys(extra).length > 0;
    const detail = detailOf(args);
    if (detail === 'raw') {
      return {
        isError: false,
        content: [asText(view.raw), ...(hasExtra ? [asText(extra)] : [])],
      };
    }
    const projected = detail === 'full' ? full(view.value) : terse(view.value);
    const merged = !hasExtra
      ? projected
      : projected && typeof projected === 'object' && !Array.isArray(projected)
        ? { ...(projected as Record<string, unknown>), ...extra }
        : { value: projected, ...extra };
    return { isError: false, content: [asText(merged)] };
  } catch (error) {
    return return_error(error) as McpResult;
  }
}

type Stopped = Extract<DebugState, { state: 'stopped' }>;

/** A debug state: under terse a stop is its place and the top frames; raw is SAP's documents of the stop. */
export async function debugStateAnswer(
  args: unknown,
  work: () => Promise<DebugState>,
  extraOf: () => Record<string, unknown> = () => ({}),
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
    (s) => {
      if (s.state !== 'stopped') return s;
      // Everything a start added beside the stop (breakpoints placed and refused, reconciliation) stays.
      const { stop, ...rest } = s as Stopped & { stop: StopView } & Record<
          string,
          unknown
        >;
      return {
        ...rest,
        ...terseStop(stop.debuggee, stop.stack, stop.attach),
        ...(stop.stackError ? { stack_error: stop.stackError } : {}),
      };
    },
    (s) => s,
    extraOf,
  );
}
