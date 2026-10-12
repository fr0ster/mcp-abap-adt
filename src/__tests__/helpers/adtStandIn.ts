/**
 * An ADT stand-in on 127.0.0.1 for the transports' credential suites: it
 * answers every request `200` with a CSRF token and a session cookie — or
 * `401` while it is told to refuse — and records each request's
 * method, path and `Authorization` header — what a credential put on the
 * wire. A suite may hold one request until it lets it go (`hold`). A probe tool that sends `GET /sap/bc/adt/probe/<id>` lets a suite
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
  /** While on, every request is answered `401`: the system refuses the credential. */
  refuse(on: boolean): void;
  /**
   * Holds the next request `match` accepts until `release()`: its arrival
   * resolves `arrived`. One request each; the others are answered as ever.
   */
  hold(match: (request: StandInRequest) => boolean): StandInHold;
  close(): Promise<void>;
}

/** A request held at the stand-in. */
export interface StandInHold {
  /** Resolves when the held request has arrived. */
  arrived: Promise<void>;
  /** Answers the held request (and any held later, if it has not come yet). */
  release(): void;
}

export const PROBE_PATH = '/sap/bc/adt/probe/';

export async function adtStandIn(): Promise<AdtStandIn> {
  const requests: StandInRequest[] = [];
  let refusing = false;
  const holds: Array<{
    match: (request: StandInRequest) => boolean;
    taken: boolean;
    arrive: () => void;
    released: Promise<void>;
    release: () => void;
  }> = [];
  const server = http.createServer((req, res) => {
    const request: StandInRequest = {
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
    };
    requests.push(request);
    const hold = holds.find((h) => !h.taken && h.match(request));
    if (hold) {
      hold.taken = true;
      hold.arrive();
    }
    req.resume();
    req.on('end', async () => {
      if (hold) await hold.released;
      if (refusing) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('');
        return;
      }
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
    refuse: (on) => {
      refusing = on;
    },
    hold: (match) => {
      let arrive!: () => void;
      const arrived = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      holds.push({ match, taken: false, arrive, released, release });
      return { arrived, release };
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const hold of holds) hold.release();
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
