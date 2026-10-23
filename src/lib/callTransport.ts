/**
 * The transport request a tool call was given, readable anywhere inside that
 * call (fr0ster/mcp-abap-adt#314).
 *
 * The failure renderer needs it to tell "SAP names a request this call did
 * not send" from "SAP names the very request this call sent". The failed
 * request's URL says so only where the client writes `corrNr` into the URL;
 * some writes send it as query parameters, which the request trace does not
 * keep. So the server runs every handler inside this scope with the call's
 * own `transport_request` argument (`callHandler`), and the renderer reads
 * both.
 *
 * Only a non-empty string argument is kept; anything else is no request.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<{ transportRequest?: string }>();

/** Runs `fn` with the `transport_request` of `args` as the call's request. */
export function runWithCallTransport<T>(args: unknown, fn: () => T): T {
  const value =
    args !== null && typeof args === 'object'
      ? (args as { transport_request?: unknown }).transport_request
      : undefined;
  return scope.run(
    typeof value === 'string' && value.trim() !== ''
      ? { transportRequest: value }
      : {},
    fn,
  );
}

/** The request the current tool call was given; `undefined` outside a call or without one. */
export function callTransportRequest(): string | undefined {
  return scope.getStore()?.transportRequest;
}
