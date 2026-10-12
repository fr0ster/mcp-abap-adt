/**
 * The one process-wide registry of live tool calls, across every server
 * instance (spec §5.1, D4): each call's controller, registered at the tool
 * wrapper's entry — before any connection is acquired or the handler runs —
 * and removed when the call ends. The process keeps them so its shutdown can
 * abort them.
 *
 * A10 adds each call's settlement, the shutdown latch and the per-instance
 * view; here it is the controllers.
 */

/** A registered call, as the registry shows it. */
export interface ActiveTool {
  /** The call's request signal: aborted by its client, its end, or shutdown. */
  readonly signal: AbortSignal;
}

const live = new Set<AbortController>();

/**
 * Registers a call's controller; answers the function that removes it.
 * Removing twice is harmless.
 */
export function registerActiveTool(controller: AbortController): () => void {
  live.add(controller);
  return () => {
    live.delete(controller);
  };
}

/** The calls live now, a snapshot. */
export function activeTools(): readonly ActiveTool[] {
  return [...live].map((controller) => ({ signal: controller.signal }));
}

/** Aborts every live call's signal (the shutdown's step). */
export function abortActiveTools(): void {
  for (const controller of [...live]) controller.abort();
}
