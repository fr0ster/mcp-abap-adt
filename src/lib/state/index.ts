/**
 * What the launchers (core, http, sse) need of the process's shutdown: the
 * one registry's settlement and latch, the shutdown sentence, the shared
 * shutdown sequence and its logoffs at once. Not on the embeddable entry: an embedder closes its own
 * instance with `closeInstance` and owns its process's signals.
 */

import '../instance.js';

export {
  isLatched,
  SHUTDOWN_SENTENCE,
  settled,
} from '../activeTools';
export {
  installShutdownSequence,
  logOffAtOnce,
  type ShutdownProcess,
} from '../shutdownSequence';
export * from './heldLocks';
export * from './InstanceState';
export * from './idleBound';
