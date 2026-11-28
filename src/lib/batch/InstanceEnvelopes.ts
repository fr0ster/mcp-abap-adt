/**
 * The owner of one MCP server instance's read envelopes (spec §3): each
 * envelope a collection of recorded read calls, named by an explicit handle
 * of 128 random bits and valid only in the session that created it (its
 * `SessionKey`).
 *
 * Created by the host and handed to the instance (`BaseMcpServer`'s
 * `envelopes` option), like the batch owner: nothing here is a module
 * global or a singleton. It is a part of the instance's held state
 * (`StatePart`): while an envelope is open, the instance holds state — kept
 * in the HTTP pool between requests, and under the held state's idle bound
 * over Streamable HTTP and SSE. Nothing of its own runs on a clock.
 *
 * The owner sends nothing. An envelope ends by its claim (execution), a
 * discard, or the owner's disposal; a claim takes it out of the owner in
 * one synchronous step, so a handle is executed once. The consumer's bound
 * (`openEnvelopes`) counts every open envelope of the owner, whatever its
 * key: at the bound a create is refused and nothing is evicted.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { envelopeLimitWords, ServerRefusal } from '../auth/serverRefusal';
import type { StatePart } from '../state/InstanceState';

/**
 * Who may name an envelope (spec §4): the session that created it — the
 * instance's connection context, by identity, and over Streamable HTTP the
 * state handle the call ran under and a digest of its destination and
 * credential headers. Built from the instance and the request alone:
 * nothing is read from SAP.
 */
export interface SessionKey {
  /** The instance's connection context, compared by identity. */
  readonly context: object;
  /** The state handle the call ran under (Streamable HTTP). */
  readonly stateHandle?: string | undefined;
  /** SHA-256 of the request's destination and credential headers (Streamable HTTP). */
  readonly digest?: Buffer | undefined;
}

/** Whether two digests are both absent, or both present and equal, compared in constant time. */
function sameDigest(a: Buffer | undefined, b: Buffer | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether `call` is the session `owner` names. */
export function sameSession(owner: SessionKey, call: SessionKey): boolean {
  return (
    owner.context === call.context &&
    owner.stateHandle === call.stateHandle &&
    sameDigest(owner.digest, call.digest)
  );
}

/** 32 upper-case hex characters, 128 random bits. */
function newHandle(taken: (handle: string) => boolean): string {
  for (;;) {
    const handle = randomBytes(16).toString('hex').toUpperCase();
    if (!taken(handle)) return handle;
  }
}

/**
 * One open envelope: its handle and session key, its numbering, and the
 * signals its recorded calls race. Each call gets a signal of its own
 * (`callSignal`), aborted with the envelope's or alone — so a failed run's
 * calls are let go without touching an answered run's.
 */
export class Envelope {
  /** The calls' own controllers, each aborted with the envelope's. */
  private readonly calls: AbortController[] = [];
  private readonly controller = new AbortController();
  private counter = 0;
  private open = true;

  constructor(
    readonly handle: string,
    readonly key: SessionKey,
  ) {}

  /** Whether the envelope is still open: not claimed, discarded or disposed. */
  isOpen(): boolean {
    return this.open;
  }

  /** The envelope's signal: aborted when it is discarded or disposed. */
  signal(): AbortSignal {
    return this.controller.signal;
  }

  /** The next number: 1, 2, … in the order taken. */
  nextNumber(): number {
    this.counter += 1;
    return this.counter;
  }

  /** How many numbers were taken. */
  recorded(): number {
    return this.counter;
  }

  /** A recorded call's own controller: aborted with the envelope, or alone. */
  callSignal(): AbortController {
    const call = new AbortController();
    if (this.controller.signal.aborted) call.abort();
    this.calls.push(call);
    return call;
  }

  /** The envelope is claimed by its execution: open no more, nothing aborted. */
  close(): void {
    this.open = false;
  }

  /** Lets the envelope and every call go: nothing is sent. */
  letGo(): void {
    this.open = false;
    this.controller.abort();
    for (const call of this.calls) call.abort();
  }
}

export class InstanceEnvelopes implements StatePart {
  /** Whether each recorded call keeps its raw parts (YAML `batch.keepRawParts`). */
  readonly keepRawParts: boolean;
  /** The consumer's bound on the open envelopes; absent, none. */
  readonly openEnvelopes: number | undefined;

  private readonly open = new Map<string, Envelope>();
  private readonly listeners: Array<() => void> = [];

  constructor(options: {
    keepRawParts: boolean;
    openEnvelopes?: number | undefined;
  }) {
    this.keepRawParts = options.keepRawParts === true;
    this.openEnvelopes = options.openEnvelopes;
  }

  /**
   * A new envelope of the session `key`: refused `envelope_limit` when the
   * consumer's bound is set and the owner holds that many open envelopes,
   * whatever their keys; nothing is evicted.
   */
  create(key: SessionKey): Envelope {
    const bound = this.openEnvelopes;
    if (bound !== undefined && this.open.size >= bound) {
      throw new ServerRefusal('envelope_limit', envelopeLimitWords(bound));
    }
    const envelope = new Envelope(
      newHandle((handle) => this.open.has(handle)),
      key,
    );
    this.open.set(envelope.handle, envelope);
    this.changed();
    return envelope;
  }

  /**
   * The open envelope `handle` names in the session `key`; an unknown handle
   * and another session's are refused alike, `envelope_unavailable`.
   */
  find(handle: string, key: SessionKey): Envelope {
    const envelope = this.open.get(handle);
    if (envelope === undefined || !sameSession(envelope.key, key)) {
      throw new ServerRefusal('envelope_unavailable');
    }
    return envelope;
  }

  /**
   * As `find`, and the envelope leaves the owner in the same synchronous
   * step: from here on its handle is not available. Its calls are not
   * aborted: its execution answers them.
   */
  claim(handle: string, key: SessionKey): Envelope {
    const envelope = this.find(handle, key);
    this.open.delete(handle);
    envelope.close();
    this.changed();
    return envelope;
  }

  /** As `claim`, then the envelope and every call are let go: nothing is sent. */
  discard(handle: string, key: SessionKey): Envelope {
    const envelope = this.claim(handle, key);
    envelope.letGo();
    return envelope;
  }

  /** The open envelopes of the session `key`, in creation order. */
  list(key: SessionKey): Envelope[] {
    return [...this.open.values()].filter((envelope) =>
      sameSession(envelope.key, key),
    );
  }

  /** How many envelopes are open, whatever their keys. */
  size(): number {
    return this.open.size;
  }

  holdsState(): boolean {
    return this.open.size > 0;
  }

  pending(): boolean {
    return false;
  }

  failures(): string[] {
    return [];
  }

  /** The state's undo (the pool's, the idle bound's, the close's): every envelope let go, nothing sent. */
  async dispose(): Promise<void> {
    if (this.open.size === 0) return;
    const envelopes = [...this.open.values()];
    this.open.clear();
    for (const envelope of envelopes) envelope.letGo();
    this.changed();
  }

  observe(onChange: () => void): void {
    this.listeners.push(onChange);
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
