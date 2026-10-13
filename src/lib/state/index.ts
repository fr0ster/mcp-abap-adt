/**
 * What the launchers (core, http, sse) need of the process's shutdown: the
 * one registry's settlement and latch, the shutdown sentence, the shared
 * shutdown sequence. Not on the embeddable entry: an embedder closes its own
 * instance with `closeInstance` and owns its process's signals.
 */
export {
  isLatched,
  SHUTDOWN_SENTENCE,
  settled,
} from '../activeTools';
export {
  installShutdownSequence,
  type ShutdownProcess,
} from '../shutdownSequence';
export * from './InstanceState';
export * from './idleBound';
