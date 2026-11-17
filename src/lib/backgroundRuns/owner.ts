/**
 * The owner of the running background runs: each running run's control
 * over its one execution connection, by `run_handle` — what
 * `DiscardBackgroundRun` cancels a running read through.
 *
 * Held in the process by the host, never in a module: a server instance
 * creates its own unless its host hands it one, and a transport server that
 * makes an instance per request (Streamable HTTP) or per stream (SSE) hands
 * every instance its own owner, so a discard that reaches another instance
 * of the same server finds the run. A handle is not authorization: the
 * caller is checked against the strategy before a control is looked up
 * (`port.ts`).
 */

import type { BackgroundRunControl } from './run';

export class BackgroundRunOwner {
  private readonly controls = new Map<string, BackgroundRunControl>();

  /** Holds a running run's control; answers its removal (idempotent). */
  register(handle: string, control: BackgroundRunControl): () => void {
    this.controls.set(handle, control);
    return () => {
      if (this.controls.get(handle) === control) {
        this.controls.delete(handle);
      }
    };
  }

  /** The running run `handle`'s control; `undefined` once it ended. */
  control(handle: string): BackgroundRunControl | undefined {
    return this.controls.get(handle);
  }
}
