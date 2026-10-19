/**
 * The owner of one MCP server instance's batch state: the open batch (a
 * communication batch or a debugger batch, one at a time) and the answers
 * of the last executed batch.
 *
 * Created by the host and handed to the instance (`BaseMcpServer`'s `batch`
 * option), like the leftover-session owner and the background-run store:
 * nothing here is a module global or a singleton. It is a part of the
 * instance's held state (`StatePart`): while a batch is open or answers are
 * kept, the instance holds state — kept in the HTTP pool between requests,
 * and under the state's idle bound on every transport, the one clock that
 * touches it. Nothing of the batch's own runs on a clock.
 *
 * The owner sends nothing: what is recorded is sent by `BatchEnd` /
 * `DebugBatchEnd`. A drop (`drop()`, `dispose()`) lets the open batch go
 * with nothing sent, aborts its signal and forgets the answers.
 */
import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerRefusal } from '../auth/serverRefusal';
import type { StatePart } from '../state/InstanceState';
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

/** The answer of one recorded call, by its number: the tool's answer built from what came. */
export type BatchAnswer = {
  number: number;
  content: CallToolResult['content'];
  isError?: true;
  /** SAP's raw parts of the call's requests, in the order sent — only when `keepRawParts`. */
  raw?: RawPart[];
};

/**
 * One recorded call: its number and the answer its handler builds once the
 * batch is sent — from all of the call's parts. It never rejects.
 */
export interface RecordedCall {
  number: number;
  answer: Promise<BatchAnswer>;
}

/**
 * What a begin hands the owner: the batch connection, the late-bound target
 * it wraps (pointed by the dispatch and `BatchEnd`), and the record of its
 * calls, in number order. A debugger batch wraps the stop's connection
 * itself (`DebugSession.openBatch`), and has no target.
 */
export interface OpenBatch {
  connection: AdtBatchConnection;
  target?: LateBoundConnection;
  recorded: RecordedCall[];
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

export class InstanceBatch implements StatePart {
  /** Whether each recorded call keeps its raw part (YAML `batch.keepRawParts`). */
  readonly keepRawParts: boolean;

  private opened_: Opened | undefined;
  private answers: ReadonlyMap<number, BatchAnswer> | undefined;
  /** The kind of the batch the kept answers came from. */
  private answersKind: BatchKind | undefined;
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
   * answers of the last batch stay readable until this one ends.
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
   * `dispose()`), never by its end. Refused `batch_mode_off` with none open.
   */
  signal(): AbortSignal {
    return this.requireOpen().controller.signal;
  }

  /**
   * The batch was executed: mode off, its answers replace the last ones.
   * Only the open batch ends — `ending`, when given, must be it: with none
   * open (the batch was dropped while it executed) or another one open,
   * nothing changes, so a drop is never undone by answers that come after.
   */
  end(answers: ReadonlyMap<number, BatchAnswer>, ending?: OpenBatch): void {
    const current = this.opened_;
    if (current === undefined) return;
    if (ending !== undefined && current.batch !== ending) return;
    this.opened_ = undefined;
    this.answers = new Map(answers);
    this.answersKind = current.kind;
    this.changed();
  }

  /**
   * A complete debugger stop: the kept answers go when a debugger batch gave
   * them, so the debug state, and its handle, end with the stop. A
   * communication batch's answers, and an open batch, stay.
   */
  dropDebuggerAnswers(): void {
    if (this.opened_ !== undefined || this.answersKind !== 'debugger') return;
    this.answers = undefined;
    this.answersKind = undefined;
    this.changed();
  }

  /**
   * Lets the open batch go with nothing sent: mode off, its signal aborted,
   * its target sealed (an `execute()` running now sends no further
   * envelope), the answers gone.
   */
  drop(): void {
    const current = this.opened_;
    this.opened_ = undefined;
    this.answers = undefined;
    this.answersKind = undefined;
    current?.batch.target?.seal();
    current?.controller.abort();
    this.changed();
  }

  /** The kept answer with number `n`, or `undefined`. */
  answer(n: number): BatchAnswer | undefined {
    return this.answers?.get(n);
  }

  holdsState(): boolean {
    return (
      this.opened_ !== undefined ||
      (this.answers !== undefined && this.answers.size > 0)
    );
  }

  pending(): boolean {
    return false;
  }

  failures(): string[] {
    return [];
  }

  /** The state's undo (the pool's, the idle bound's): drops the batch and the answers; nothing is sent. */
  async dispose(): Promise<void> {
    this.drop();
  }

  observe(onChange: () => void): void {
    this.listeners.push(onChange);
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
