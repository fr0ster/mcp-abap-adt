import type { HandlerContext } from '../../handlers/interfaces';
import type { StatePart } from '../state/InstanceState';
import { AmdpSession } from './AmdpSession';
import { DebugCleanupError, DebugSession } from './DebugSession';
import { type DebugFailure, thrownFailure } from './failures';
import {
  type BreakpointConflict,
  type DebuggerIds,
  resolveBreakpointConflict,
  resolveDebuggerIds,
} from './ids';
import { liveAmdpPorts, liveDebugPorts } from './ports';

/** One server instance's debugger — a part of its state: both kinds, the SAP ids. */
export class DebuggerInstance implements StatePart {
  readonly abap: DebugSession<HandlerContext>;
  readonly amdp: AmdpSession<HandlerContext>;

  constructor(sessions: {
    abap: DebugSession<HandlerContext>;
    amdp: AmdpSession<HandlerContext>;
  }) {
    this.abap = sessions.abap;
    this.amdp = sessions.amdp;
  }

  holdsState(): boolean {
    return this.abap.holdsState() || this.amdp.holdsState();
  }

  /** Only the AMDP session finishes a cleanup on its own (its last event batch). */
  pending(): boolean {
    return this.amdp.pending();
  }

  /**
   * What a cleanup could not undo, for the host's log line: each entry — the
   * method's error as it is, with its step — serialised whole.
   */
  failures(): string[] {
    return [...this.abap.failures(), ...this.amdp.failures()].map((entry) =>
      JSON.stringify(entry),
    );
  }

  observe(onChange: () => void): void {
    this.abap.observe(onChange);
    this.amdp.observe(onChange);
  }

  /**
   * Stops both; what either could not undo is reported, named, and stays for
   * another stop. Answers the notes that are no debt. When one side fails, the
   * notes the other answered go with the error: they are answered once, and a
   * later stop has nothing to answer them again.
   */
  async stop(): Promise<DebugFailure[]> {
    const results = await Promise.allSettled([
      this.abap.stop(),
      this.amdp.stop(),
    ]);
    // Each side's failures as entries: a side's cleanup error carries its
    // own; anything else it threw is one entry, with the step.
    const failures = results.flatMap((r, i) =>
      r.status !== 'rejected'
        ? []
        : r.reason instanceof DebugCleanupError
          ? [...r.reason.failures]
          : [thrownFailure(r.reason, i === 0 ? 'stop' : 'stop AMDP')],
    );
    const notes = results.flatMap((r) =>
      r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [],
    );
    if (failures.length) {
      const failedNotes = results.flatMap((r) =>
        r.status === 'rejected' && r.reason instanceof DebugCleanupError
          ? [...r.reason.notes]
          : [],
      );
      throw new DebugCleanupError(failures, [...failedNotes, ...notes]);
    }
    return notes;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}

/**
 * The breakpoint conflict is the host's: the request scope, the environment,
 * then `options.breakpointConflict`; an embedder overriding
 * `BaseMcpServer.debuggerFor()` passes it here.
 */
export function createDebuggerInstance(
  ids: DebuggerIds & {
    stated: boolean;
    terminalStated?: boolean;
  } = resolveDebuggerIds(),
  options: { breakpointConflict?: BreakpointConflict } = {},
): DebuggerInstance {
  return new DebuggerInstance({
    abap: new DebugSession(liveDebugPorts(), ids, {
      breakpointConflict: resolveBreakpointConflict(options.breakpointConflict),
    }),
    amdp: new AmdpSession(liveAmdpPorts()),
  });
}
