/**
 * The corrected header pairs of the systems the process talks to: what a
 * system answered `406`/`415` to, corrected (`withAdtHeaders`), kept for the
 * next call of the same operation on the same system.
 *
 * The key is the system and the operation — never the credentials: two
 * destinations to the same system share their corrections. The value is the
 * corrected pair. Nothing expires: a later `406`/`415` on a kept pair is
 * corrected again and overwrites it. In memory, in the owner the host creates
 * (one per process, shared by its server instances); no module state.
 */
import type { IAdtHeaders } from '@mcp-abap-adt/interfaces-adt';
import { type AdtOperation, DEFAULT_ADT_HEADERS } from './defaultPairs';

/** One system's header pairs: the kept correction, else the default. */
export interface AdtHeaderPort {
  /** The pair to send for `operation`: the system's kept one, else the default. */
  pairFor(operation: AdtOperation): IAdtHeaders;
  /** Keeps `pair` as the system's pair for `operation`. */
  remember(operation: AdtOperation, pair: IAdtHeaders): void;
}

type Pairs = Map<AdtOperation, IAdtHeaders>;

function portOver(pairs: Pairs): AdtHeaderPort {
  return {
    pairFor: (operation) =>
      pairs.get(operation) ?? DEFAULT_ADT_HEADERS[operation],
    remember: (operation, pair) => {
      pairs.set(
        operation,
        Object.freeze({ accept: pair.accept, contentType: pair.contentType }),
      );
    },
  };
}

/** The owner of the corrected pairs, created by the host. */
export class AdtHeaderPairs {
  private readonly bySystem = new Map<string, Pairs>();
  private readonly byConnection = new WeakMap<object, Pairs>();

  /** The port of the system named `system` (the target a destination points at). */
  forSystem(system: string): AdtHeaderPort {
    let pairs = this.bySystem.get(system);
    if (pairs === undefined) {
      pairs = new Map();
      this.bySystem.set(system, pairs);
    }
    return portOver(pairs);
  }

  /**
   * The port of a connection with no destination (a host's own): the
   * system it talks to is known only as that connection.
   */
  forConnection(connection: object): AdtHeaderPort {
    let pairs = this.byConnection.get(connection);
    if (pairs === undefined) {
      pairs = new Map();
      this.byConnection.set(connection, pairs);
    }
    return portOver(pairs);
  }
}
