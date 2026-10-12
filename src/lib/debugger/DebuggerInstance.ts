import type { HandlerContext } from '../../handlers/interfaces';
import type { StatePart } from '../state/InstanceState';
import { AmdpSession } from './AmdpSession';
import { DebugCleanupError, DebugSession } from './DebugSession';
import {
  type BreakpointConflict,
  type DebuggerIds,
  resolveBreakpointConflict,
  resolveDebuggerIds,
} from './ids';
import { liveAmdpPorts, liveDebugPorts } from './ports';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

  failures(): string[] {
    return [...this.abap.failures(), ...this.amdp.failures()];
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
  async stop(): Promise<string[]> {
    const results = await Promise.allSettled([
      this.abap.stop(),
      this.amdp.stop(),
    ]);
    const failures = results.flatMap((r) =>
      r.status === 'rejected' ? [messageOf(r.reason)] : [],
    );
    const notes = results.flatMap((r) =>
      r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [],
    );
    if (failures.length) {
      // A failing side's own notes are already in its message; only the field gathers them.
      const failedNotes = results.flatMap((r) =>
        r.status === 'rejected' && r.reason instanceof DebugCleanupError
          ? [...r.reason.notes]
          : [],
      );
      throw new DebugCleanupError([...failures, ...notes].join('; '), [
        ...failedNotes,
        ...notes,
      ]);
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
