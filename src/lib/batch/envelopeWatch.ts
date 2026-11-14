/**
 * What the connection under a batch's `AdtBatchConnection` did with its
 * envelopes: the errors it threw, and how many envelopes it answered.
 *
 * `BatchEnd` reads it when `execute()` rejects (spec §5.3): a rejection the
 * connection threw is `execute()`'s error, as it came (SAP's outer answer, a
 * transport failure, a credential refusal); a rejection that came after the
 * connection answered is adt-clients' own reading of that answer — it could
 * not be split into parts (`batch_unsplit`), or its parts were not as many as
 * the requests sent (`batch_parts_mismatch`). adt-clients words both as
 * plain errors; the server never reads their messages.
 *
 * The watch only forwards: every member reaches the connection it is placed
 * over, the session members as that connection has them at the call — over
 * a late-bound target, as the connection the target points at then.
 */

import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { LateBoundConnection } from './lateBound';

type Session = 'stateful' | 'stateless';

/**
 * The forwarding connection `EnvelopeWatch.over` answers. Its session members
 * are the connection's as it has them now: each forwards to the same-named
 * member and is present only while the connection has it. Over a late-bound
 * target they follow every `point()` / `seal()`, so a target wrapped before
 * it is pointed answers as the connection it is pointed at.
 */
class WatchedConnection implements IAbapConnection {
  declare getSessionType?: () => Session;
  declare getSessionMode?: () => Session;

  /** `makeAdtRequest` as the watch sends it: through the connection, seen. */
  readonly makeAdtRequest: (
    request: IAbapRequestOptions,
  ) => Promise<IAdtWireResponse>;

  constructor(
    private readonly connection: IAbapConnection,
    send: (request: IAbapRequestOptions) => Promise<IAdtWireResponse>,
  ) {
    this.makeAdtRequest = send;
    this.follow();
    if (connection instanceof LateBoundConnection) {
      connection.onPoint(() => this.follow());
    }
  }

  /** The connection's session members as it has them now. */
  private follow(): void {
    const connection = this.connection;
    const type = connection.getSessionType;
    if (type === undefined) delete this.getSessionType;
    else this.getSessionType = () => type.call(connection);
    const mode = connection.getSessionMode;
    if (mode === undefined) delete this.getSessionMode;
    else this.getSessionMode = () => mode.call(connection);
  }

  // Own members, as the forwarding literal had them: one taken off the
  // connection still forwards.
  readonly connect = (): Promise<void> => this.connection.connect();
  readonly getBaseUrl = (): Promise<string | undefined> =>
    this.connection.getBaseUrl();
  readonly getSessionId = (): string | null => this.connection.getSessionId();
  readonly setSessionType = (type: Session): void =>
    this.connection.setSessionType(type);
}

export class EnvelopeWatch {
  private readonly thrown: Set<unknown> = new Set();
  private answers = 0;

  /** A forwarding connection over `connection`, seen by this watch. */
  over(connection: IAbapConnection): IAbapConnection {
    const thrown = this.thrown;
    const answered = () => {
      this.answers += 1;
    };
    return new WatchedConnection(
      connection,
      (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
        let sending: Promise<IAdtWireResponse>;
        try {
          sending = connection.makeAdtRequest(request);
        } catch (error) {
          thrown.add(error);
          return Promise.reject(error);
        }
        return Promise.resolve(sending).then(
          (response) => {
            answered();
            return response;
          },
          (error: unknown) => {
            thrown.add(error);
            throw error;
          },
        );
      },
    );
  }

  /** Whether the connection threw `error` for an envelope. */
  threw(error: unknown): boolean {
    return this.thrown.has(error);
  }

  /** How many envelopes the connection answered. */
  answered(): number {
    return this.answers;
  }
}
