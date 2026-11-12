/**
 * The adapter between an SDK server transport and the SDK's `Transport`
 * contract, which `Server.connect` takes.
 *
 * Under `exactOptionalPropertyTypes` the SDK's own server transports do not
 * satisfy its `Transport`: `StreamableHTTPServerTransport.onclose` (and
 * `onerror`, `onmessage`) read `(… ) | undefined`, while `Transport` declares
 * `onclose?: () => void`. That is a third party's contract, so the server
 * wraps the transport instead of asserting it.
 *
 * - `start`, `send` and `close` are forwarded.
 * - `onclose`, `onerror` and `onmessage` are accessor pairs over stored
 *   fields. The getter answers the handler stored at that moment, or a stable
 *   no-op of the adapter's when none is stored — never a function that reads
 *   the current field: the protocol's `connect` saves the getter's answer and
 *   then sets a handler that calls it, so a reader of the current field would
 *   call itself.
 * - The SDK transport's events are forwarded separately: at construction the
 *   adapter sets its own `onclose` / `onerror` / `onmessage` on it, once; each
 *   calls the handler stored when the event comes, if one is.
 * - `sessionId` is a plain optional field. After `start` and before a message
 *   reaches the protocol, it is the SDK transport's when that has one, and
 *   absent when not: no ID is made up.
 */
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';

type CloseHandler = () => void;
type ErrorHandler = (error: Error) => void;
type MessageHandler = <T extends JSONRPCMessage>(
  message: T,
  extra?: MessageExtraInfo,
) => void;

/**
 * What the adapter takes of an SDK server transport: its methods, and its
 * handler properties as the SDK's classes declare them (`| undefined`).
 * `StreamableHTTPServerTransport` and `SSEServerTransport` both are one.
 */
export interface SdkServerTransport {
  start(): Promise<void>;
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?:
    | ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void)
    | undefined;
  readonly sessionId?: string | undefined;
}

const NO_CLOSE: CloseHandler = () => {};
const NO_ERROR: ErrorHandler = () => {};
const NO_MESSAGE: MessageHandler = () => {};

export class SdkTransport implements Transport {
  readonly #sdk: SdkServerTransport;
  #onclose: CloseHandler | undefined;
  #onerror: ErrorHandler | undefined;
  #onmessage: MessageHandler | undefined;
  // Declared, not initialised: an absent ID is a missing property, never `undefined`.
  declare sessionId?: string;

  constructor(sdk: SdkServerTransport) {
    this.#sdk = sdk;
    sdk.onclose = () => {
      this.#onclose?.();
    };
    sdk.onerror = (error) => {
      this.#onerror?.(error);
    };
    sdk.onmessage = (message, extra) => {
      this.#copySessionId();
      this.#onmessage?.(message, extra);
    };
  }

  get onclose(): CloseHandler {
    return this.#onclose ?? NO_CLOSE;
  }

  set onclose(handler: CloseHandler) {
    this.#onclose = handler;
  }

  get onerror(): ErrorHandler {
    return this.#onerror ?? NO_ERROR;
  }

  set onerror(handler: ErrorHandler) {
    this.#onerror = handler;
  }

  get onmessage(): MessageHandler {
    return this.#onmessage ?? NO_MESSAGE;
  }

  set onmessage(handler: MessageHandler) {
    this.#onmessage = handler;
  }

  async start(): Promise<void> {
    await this.#sdk.start();
    this.#copySessionId();
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return this.#sdk.send(message, options);
  }

  close(): Promise<void> {
    return this.#sdk.close();
  }

  #copySessionId(): void {
    const sessionId = this.#sdk.sessionId;
    if (sessionId !== undefined) this.sessionId = sessionId;
    else delete this.sessionId;
  }
}
