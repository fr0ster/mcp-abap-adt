/**
 * An ADT stand-in on 127.0.0.1 for the transports' credential suites: it
 * answers every request `200` with a CSRF token and a session cookie, and records each request's
 * method, path and `Authorization` header — what a credential put on the
 * wire. A probe tool that sends `GET /sap/bc/adt/probe/<id>` lets a suite
 * tell which call presented which credential.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';

export interface StandInRequest {
  method: string;
  url: string;
  authorization: string | undefined;
}

export interface AdtStandIn {
  url: string;
  requests: StandInRequest[];
  /** The `Authorization` of the probe request `id` sent, if it came. */
  authorizationOf(id: string): string | undefined;
  close(): Promise<void>;
}

export const PROBE_PATH = '/sap/bc/adt/probe/';

export async function adtStandIn(): Promise<AdtStandIn> {
  const requests: StandInRequest[] = [];
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
    });
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'x-csrf-token': 'csrf-placeholder',
        // An ABAP session: what a connection needs before it reports connected.
        'set-cookie': 'SAP_SESSIONID_X01_100=session-placeholder; path=/',
      });
      res.end('');
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    authorizationOf: (id) =>
      requests.find((r) => r.url === `${PROBE_PATH}${id}`)?.authorization,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** `Basic` of a user and password, as the provider writes it. */
export const basicOf = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/**
 * `ProbeAdt { id, delayMs? }`: waits `delayMs` on its connection, then sends
 * `GET /sap/bc/adt/probe/<id>` on it and answers `id`.
 */
export function probeGroup(
  extra: HandlerEntry[] = [],
): IHandlerGroup & { getHandlers(): HandlerEntry[] } {
  return {
    getName: () => 'adt-probe',
    registerHandlers: () => {},
    getHandlers: (): HandlerEntry[] => [
      {
        toolDefinition: {
          name: 'ProbeAdt',
          description: 'sends one request on its connection',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              delayMs: { type: 'number' },
              state_handle: { type: 'string' },
            },
            required: ['id'],
          },
        } as never,
        handler: (async (
          context: {
            connection: { makeAdtRequest(o: object): Promise<unknown> };
          },
          args: { id: string; delayMs?: number },
        ) => {
          await new Promise((r) => setTimeout(r, args.delayMs ?? 0));
          await context.connection.makeAdtRequest({
            url: `${PROBE_PATH}${args.id}`,
            method: 'GET',
            timeout: 10_000,
          });
          return { content: [{ type: 'text', text: args.id }] };
        }) as never,
      },
      ...extra,
    ],
  } as never;
}
