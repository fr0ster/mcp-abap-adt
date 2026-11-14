// A stand-in for Node's EventEmitter, typed by Node's contract: a third
// party's type is its contract, not walked.
import type { EventEmitter } from 'node:events';

type NodeListener = Parameters<EventEmitter['on']>[1];

export interface Watched {
  on(event: string, listener: NodeListener): void;
}

// The same stand-in with a listener of its own: refused.
export interface Mirrored {
  on(event: string, listener: (...args: unknown[]) => void): void;
}
