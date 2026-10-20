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
 * over, the session members as that connection has them.
 */
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';

type Session = 'stateful' | 'stateless';

/** What an optional session member of a connection may answer. */
interface SessionAware {
  getSessionType?: () => Session | undefined;
  getSessionMode?: () => Session | undefined;
}

export class EnvelopeWatch {
  private readonly thrown = new Set<unknown>();
  private answers = 0;

  /** A forwarding connection over `connection`, seen by this watch. */
  over(connection: IAbapConnection): IAbapConnection {
    const typed = connection as IAbapConnection & SessionAware;
    const thrown = this.thrown;
    const answered = () => {
      this.answers += 1;
    };
    return {
      connect: () => connection.connect(),
      getBaseUrl: () => connection.getBaseUrl(),
      getSessionId: () => connection.getSessionId(),
      setSessionType: (type: Session) => connection.setSessionType(type),
      getSessionType: () => typed.getSessionType?.(),
      getSessionMode: () => typed.getSessionMode?.(),
      makeAdtRequest<T = unknown, D = unknown>(
        request: IAbapRequestOptions,
      ): Promise<IAdtWireResponse<T, D>> {
        let sending: Promise<IAdtWireResponse<T, D>>;
        try {
          sending = connection.makeAdtRequest<T, D>(request);
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
    } as IAbapConnection;
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
