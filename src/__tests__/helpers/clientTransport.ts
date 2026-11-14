/**
 * An SDK client transport as the SDK's `Transport`, which `Client.connect`
 * takes. Under `exactOptionalPropertyTypes` the SDK's own client classes do
 * not satisfy it: `StreamableHTTPClientTransport.sessionId` is a getter
 * answering `string | undefined`, while `Transport` declares
 * `sessionId?: string`. That is a third party's declaration, so the tests
 * wrap the transport, as the server wraps its own (`SdkTransport`), instead
 * of asserting it.
 *
 * `start`, `send`, `close` and `setProtocolVersion` are forwarded; the event
 * handlers are accessor pairs over stored fields, the SDK transport's events
 * forwarded to whatever is stored when they come (the protocol saves the
 * getter's answer and then sets a handler that calls it); `sessionId` is the
 * SDK transport's, copied when it has one.
 */
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/** What the adapter takes: `StreamableHTTPClientTransport` and `SSEClientTransport` both are one. */
export interface SdkClientTransport {
  start(): Promise<void>;
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;
  close(): Promise<void>;
  setProtocolVersion(version: string): void;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  readonly sessionId?: string | undefined;
}

type CloseHandler = () => void;
type ErrorHandler = (error: Error) => void;
type MessageHandler = (message: JSONRPCMessage) => void;

const NO_CLOSE: CloseHandler = () => {};
const NO_ERROR: ErrorHandler = () => {};
const NO_MESSAGE: MessageHandler = () => {};

class ClientTransport implements Transport {
  readonly #sdk: SdkClientTransport;
  #onclose: CloseHandler | undefined;
  #onerror: ErrorHandler | undefined;
  #onmessage: MessageHandler | undefined;
  declare sessionId?: string;

  constructor(sdk: SdkClientTransport) {
    this.#sdk = sdk;
    sdk.onclose = () => {
      this.#onclose?.();
    };
    sdk.onerror = (error) => {
      this.#onerror?.(error);
    };
    sdk.onmessage = (message) => {
      this.#copySessionId();
      this.#onmessage?.(message);
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

  async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ): Promise<void> {
    await this.#sdk.send(message, options);
    this.#copySessionId();
  }

  close(): Promise<void> {
    return this.#sdk.close();
  }

  setProtocolVersion(version: string): void {
    this.#sdk.setProtocolVersion(version);
  }

  #copySessionId(): void {
    const sessionId = this.#sdk.sessionId;
    if (sessionId !== undefined) this.sessionId = sessionId;
    else delete this.sessionId;
  }
}

/** `sdk` as the `Transport` `Client.connect` takes. */
export function clientTransport(sdk: SdkClientTransport): Transport {
  return new ClientTransport(sdk);
}
