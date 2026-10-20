/**
 * The owner of one MCP server instance's batch state: the open batch (a
 * communication batch or a debugger batch, one at a time) and the map of
 * the last ended batch — its numbers, each answered when read.
 *
 * Created by the host and handed to the instance (`BaseMcpServer`'s `batch`
 * option), like the leftover-session owner and the background-run store:
 * nothing here is a module global or a singleton. It is a part of the
 * instance's held state (`StatePart`): while a batch is open or a map is
 * kept, the instance holds state — kept in the HTTP pool between requests,
 * and under the state's idle bound on every transport, the one clock that
 * touches it. Nothing of the batch's own runs on a clock.
 *
 * The owner sends nothing: what is recorded is sent by `BatchEnd` /
 * `DebugBatchEnd`, which split the envelope's answer into the map (`end`) or
 * failed (`fail`). A number's answer is built when it is first read
 * (`answer`): its handler, waiting at its first request, is resumed with its
 * parts; the answer is kept. A handler never read is awaited by nothing and
 * goes with its map: when the map is replaced, dropped or disposed, its
 * batch's signal is aborted, so the handler ends its wait. A drop (`drop()`,
 * `dispose()`) lets the open batch go with nothing sent, aborts its signal
 * and forgets the map.
 */
import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerRefusal } from '../auth/serverRefusal';
import type { StatePart } from '../state/InstanceState';
import type { EnvelopeWatch } from './envelopeWatch';
import type { LateBoundConnection } from './lateBound';
import type { SessionKind } from './sessionKind';

/** Which batch is open: none, the communication batch, or the debugger batch. */
export type BatchMode = 'off' | 'communication' | 'debugger';

/** The kind of a batch that can be begun. */
export type BatchKind = Exclude<BatchMode, 'off'>;

/** A part of the envelope's answer as it came, kept when `keepRawParts`: one per request of a call, in the order sent. */
export type RawPart = {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
};

/** The answer of one recorded call, by its number: the tool's answer its handler built from its parts. */
export type BatchAnswer = {
  number: number;
  content: CallToolResult['content'];
  isError?: true;
  /** SAP's raw parts of the call's requests, in the order sent — only when `keepRawParts`. */
  raw?: RawPart[];
};

/** `BatchEnd`'s own error, as it answered it: what every number of its batch answers. */
export type BatchFailure = {
  content: CallToolResult['content'];
  isError?: boolean;
};

/** How one recorded request's part settled in `execute()`, as adt-clients settled it. */
export type PartSettlement =
  | { state: 'pending' }
  | { state: 'resolved'; value: unknown }
  | { state: 'rejected'; error: unknown };

/**
 * One recorded call: its number, how its requests' parts settled, and its
 * handler — waiting at its first request until the number is read.
 */
export interface RecordedCall {
  number: number;
  /** The settlement of each request the call recorded, in the order recorded. */
  parts(): PartSettlement[];
  /**
   * Resumes the handler with its parts and builds the number's answer from
   * them. The owner calls it once, when the number is first read. Never
   * rejects.
   */
  resume(): Promise<BatchAnswer>;
}

/**
 * What a begin hands the owner: the batch connection, the late-bound target
 * it wraps (pointed by the dispatch and `BatchEnd`), the watch of the
 * connection its envelopes go out on, and the record of its calls, in
 * number order. A debugger batch wraps the stop's connection itself
 * (`DebugSession.openBatch`), and has no target.
 */
export interface OpenBatch {
  connection: AdtBatchConnection;
  target?: LateBoundConnection;
  /**
   * What the connection under `connection` did with the envelopes. Absent,
   * every rejection of `execute()` is `BatchEnd`'s error as it came.
   */
  envelopes?: EnvelopeWatch;
  recorded: RecordedCall[];
  /**
   * The instance's SAP session `BatchEnd` sent the envelope on
   * (`HeldLocks.session()`), set by `BatchEnd`: a lock read by number is
   * held only while that session is the live one.
   */
  lockSession?: number;
  /** A debugger batch: the debug session it records at, an ABAP stop or an AMDP break. */
  debuggee?: 'abap' | 'amdp';
}

interface Opened {
  readonly kind: BatchKind;
  readonly batch: OpenBatch;
  readonly controller: AbortController;
  /** The last number taken; the next is one more. */
  counter: number;
  /** The session kind the batch holds: its first recorded request's. */
  holds: SessionKind | undefined;
}

/** A number of the map: its call, and its answer once it was first read. */
interface MapEntry {
  readonly call: RecordedCall;
  answer?: Promise<BatchAnswer>;
}

/**
 * What the last ended batch left: the map — each number's call, resumed when
 * read — or, when its end failed, no map: the numbers it recorded, each
 * answering that failure.
 */
type Kept =
  | {
      readonly kind: BatchKind;
      readonly batch: OpenBatch;
      readonly controller: AbortController;
      readonly map: ReadonlyMap<number, MapEntry>;
    }
  | {
      readonly kind: BatchKind;
      readonly batch: OpenBatch;
      readonly numbers: ReadonlySet<number>;
      failure: BatchFailure;
    };

export class InstanceBatch implements StatePart {
  /** Whether each recorded call keeps its raw part (YAML `batch.keepRawParts`). */
  readonly keepRawParts: boolean;

  private opened_: Opened | undefined;
  private kept: Kept | undefined;
  private readonly listeners: Array<() => void> = [];

  constructor(options: { keepRawParts: boolean }) {
    this.keepRawParts = options.keepRawParts === true;
  }

  mode(): BatchMode {
    return this.opened_?.kind ?? 'off';
  }

  /**
   * Opens a batch of `kind`. Refused `batch_mode_on` while a batch of the
   * same kind is open, `batch_mode_other` while the other kind is. The
   * map of the last batch stays readable until this one ends.
   */
  begin(kind: BatchKind, open: OpenBatch): void {
    this.refuseBegin(kind);
    this.opened_ = {
      kind,
      batch: open,
      controller: new AbortController(),
      counter: 0,
      holds: undefined,
    };
    this.changed();
  }

  /**
   * Throws the refusal a begin of `kind` meets now: `batch_mode_on` while a
   * batch of the same kind is open, `batch_mode_other` while the other kind
   * is; nothing while none is open.
   */
  refuseBegin(kind: BatchKind): void {
    const current = this.opened_;
    if (current !== undefined) {
      throw new ServerRefusal(
        current.kind === kind ? 'batch_mode_on' : 'batch_mode_other',
      );
    }
  }

  /** The open batch, or `undefined` when none is open. */
  opened(): OpenBatch | undefined {
    return this.opened_?.batch;
  }

  /**
   * The session kind the open batch holds — LOCK, UNLOCK or stateless (a
   * debugger batch: its one stateful kind) — decided by its first recorded
   * request; `undefined` before it, or with no batch open. Every batch end
   * sends one envelope: a request of another kind is refused before it is
   * recorded (`batch_other_kind`).
   */
  kind(): SessionKind | undefined {
    return this.opened_?.holds;
  }

  /**
   * A request of `kind` was recorded: the first decides the batch's kind.
   * Refused `batch_mode_off` with none open.
   */
  recorded(kind: SessionKind): void {
    const current = this.requireOpen();
    if (current.holds === undefined) current.holds = kind;
  }

  /** The next number of the open batch: 1, 2, … in the order taken. Refused `batch_mode_off` with none open. */
  nextNumber(): number {
    const current = this.requireOpen();
    current.counter += 1;
    return current.counter;
  }

  /**
   * The open batch's signal: aborted when the batch is dropped (`drop()`,
   * `dispose()`), when its end fails, and when its map is replaced or
   * dropped — never by an end that keeps its map. Refused `batch_mode_off` with none open.
   */
  signal(): AbortSignal {
    return this.requireOpen().controller.signal;
  }

  /**
   * The batch was executed and its answer split (spec §5.2.3): mode off, its
   * calls' map replaces the kept one — a number's handler is resumed only
   * when the number is read. Only the open batch ends — `ending`, when
   * given, must be it: with none open (the batch was dropped while it
   * executed) or another one open, nothing changes, so a drop is never
   * undone by an end that comes after.
   */
  end(ending?: OpenBatch): void {
    const current = this.closing(ending);
    if (current === undefined) return;
    const map = new Map<number, MapEntry>();
    for (const call of current.batch.recorded) map.set(call.number, { call });
    this.keep({
      kind: current.kind,
      batch: current.batch,
      controller: current.controller,
      map,
    });
  }

  /**
   * `BatchEnd` failed (spec §5.3) — before `execute()`, in it, or splitting
   * its answer: mode off, no map; every number the batch recorded answers
   * `failure`, the kept map replaced by none. No handler is resumed: the
   * batch's signal is aborted, so every one ends its wait. With `ending`
   * the last ended batch and already failed, `failure` is what its numbers
   * answer from now on — the dispatch's own answer of the error. Otherwise
   * (no batch open, another one open) nothing changes.
   */
  fail(failure: BatchFailure, ending?: OpenBatch): void {
    const kept = this.kept;
    if (
      ending !== undefined &&
      this.opened_?.batch !== ending &&
      kept !== undefined &&
      kept.batch === ending &&
      'numbers' in kept
    ) {
      kept.failure = failure;
      return;
    }
    const current = this.closing(ending);
    if (current === undefined) return;
    current.controller.abort();
    this.keep({
      kind: current.kind,
      batch: current.batch,
      numbers: new Set(current.batch.recorded.map((call) => call.number)),
      failure,
    });
  }

  /**
   * A complete debugger stop: the kept map goes when a debugger batch left
   * it, so the debug state, and its handle, end with the stop. A
   * communication batch's map, and an open batch, stay.
   */
  dropDebuggerAnswers(): void {
    if (this.opened_ !== undefined || this.kept?.kind !== 'debugger') return;
    this.keep(undefined);
  }

  /**
   * Lets the open batch go with nothing sent: mode off, its signal aborted,
   * its target sealed (an `execute()` running now sends no further
   * envelope), the map gone.
   */
  drop(): void {
    const current = this.opened_;
    this.opened_ = undefined;
    current?.batch.target?.seal();
    current?.controller.abort();
    this.keep(undefined);
  }

  /**
   * The answer of number `n` of the last ended batch, or `undefined` when it
   * has none (or no batch ended here). A number of the map is built when it
   * is first read — its handler resumed with its parts — and kept: read
   * again, it answers the same, and the handler runs once. A number of a
   * batch whose end failed answers that failure.
   */
  answer(n: number): Promise<BatchAnswer> | undefined {
    const kept = this.kept;
    if (kept === undefined) return undefined;
    if ('numbers' in kept) {
      if (!kept.numbers.has(n)) return undefined;
      const { content, isError } = kept.failure;
      return Promise.resolve({
        number: n,
        content,
        ...(isError === true ? { isError: true as const } : {}),
      });
    }
    const entry = kept.map.get(n);
    if (entry === undefined) return undefined;
    entry.answer ??= entry.call.resume();
    return entry.answer;
  }

  holdsState(): boolean {
    const kept = this.kept;
    return (
      this.opened_ !== undefined ||
      (kept !== undefined &&
        ('numbers' in kept ? kept.numbers.size > 0 : kept.map.size > 0))
    );
  }

  pending(): boolean {
    return false;
  }

  failures(): string[] {
    return [];
  }

  /** The state's undo (the pool's, the idle bound's): drops the batch and the map; nothing is sent. */
  async dispose(): Promise<void> {
    this.drop();
  }

  observe(onChange: () => void): void {
    this.listeners.push(onChange);
  }

  /** The open batch, when `ending` (if given) is it; mode off. */
  private closing(ending: OpenBatch | undefined): Opened | undefined {
    const current = this.opened_;
    if (current === undefined) return undefined;
    if (ending !== undefined && current.batch !== ending) return undefined;
    this.opened_ = undefined;
    return current;
  }

  /**
   * `next` replaces the kept map: the replaced map's handlers never read
   * are let go — its batch's signal aborted, so each ends its wait.
   */
  private keep(next: Kept | undefined): void {
    const replaced = this.kept;
    this.kept = next;
    if (replaced !== undefined && 'map' in replaced) {
      replaced.controller.abort();
    }
    this.changed();
  }

  private requireOpen(): Opened {
    const current = this.opened_;
    if (current === undefined) throw new ServerRefusal('batch_mode_off');
    return current;
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
