import type { HandlerContext } from '../../handlers/interfaces';
import type { StateDescription, StatePart } from '../state/InstanceState';
import { AmdpSession } from './AmdpSession';
import { DebugCleanupError, DebugSession } from './DebugSession';
import { type DebuggerIds, resolveDebuggerIds } from './ids';
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

  /** The sessions held; the ABAP one carries the SAP ids. */
  describe(): StateDescription[] {
    return [
      ...(this.abap.holdsState() ? [this.abap.describe()] : []),
      ...(this.amdp.holdsState() ? [this.amdp.describe()] : []),
    ];
  }

  /** Stops both; what either could not undo is reported, named, and stays for another stop. */
  async stop(): Promise<void> {
    const results = await Promise.allSettled([
      this.abap.stop(),
      this.amdp.stop(),
    ]);
    const failures = results.flatMap((r) =>
      r.status === 'rejected' ? [messageOf(r.reason)] : [],
    );
    if (failures.length) throw new DebugCleanupError(failures.join('; '));
  }

  dispose(): Promise<void> {
    return this.stop();
  }
}

export function createDebuggerInstance(
  ids: DebuggerIds & { stated: boolean } = resolveDebuggerIds(),
): DebuggerInstance {
  return new DebuggerInstance({
    abap: new DebugSession(liveDebugPorts(), ids),
    amdp: new AmdpSession(liveAmdpPorts()),
  });
}
