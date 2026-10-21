/**
 * An ADT stand-in on 127.0.0.1 for the transports' credential suites: it
 * answers every request `200` with a CSRF token and a session cookie — or
 * `401` while it is told to refuse — and records each request's
 * method, path and `Authorization` header — what a credential put on the
 * wire. A suite may hold one request until it lets it go (`hold`). A probe tool that sends `GET /sap/bc/adt/probe/<id>` lets a suite
 * tell which call presented which credential.
 *
 * Each ABAP session is its own: a request that carries no session cookie
 * opens a new one (`session-<n>`), and every request records the session it
 * ran in (`session`) and its `x-sap-adt-sessiontype` (`sessionType`) — so a
 * suite can tell which connection sent what, and which one was logged off.
 * A session the suite ends (`endSession`) is gone: its cookie opens a new one.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import { LOCK_SUCCESS_XML } from './recordingConnection';

export interface StandInRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  /** The ABAP session the request ran in (`session-<n>`). */
  session: string;
  /** Its `x-sap-adt-sessiontype` header, if any. */
  sessionType: string | undefined;
  /** Its `Cookie` header, if any. */
  cookie: string | undefined;
  /** Its `Content-Type` header, if any. */
  contentType: string | undefined;
  /** Its `Accept` header, if any. */
  accept: string | undefined;
  /** Its body, once it has arrived in full; `''` before. */
  body: string;
}

/** What `respond` answers a request with. */
export interface StandInResponse {
  status: number;
  headers?: Record<string, string>;
  text?: string;
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
  /**
   * From now on every request `match` accepts is answered `status` (a
   * refused `UNLOCK`, a refused debugger stop); the others as ever. `text`:
   * an ADT exception document it answers with.
   */
  answer(
    match: (request: StandInRequest) => boolean,
    status: number,
    text?: string,
  ): void;
  /**
   * From now on every request `match` accepts is answered by `respond`,
   * which reads the whole request, its body included (an envelope's parts);
   * ahead of `answer` and `body`. The session cookie goes beside its headers.
   */
  respond(
    match: (request: StandInRequest) => boolean,
    respond: (request: StandInRequest) => StandInResponse,
  ): void;
  /** The next request `match` accepts is answered `status`, once. */
  answerOnce(match: (request: StandInRequest) => boolean, status: number): void;
  /**
   * From now on every request `match` accepts is answered `200` with `text`
   * as its body, and `headers` beside the stand-in's own.
   */
  body(
    match: (request: StandInRequest) => boolean,
    text: string,
    headers?: Record<string, string>,
  ): void;
  /**
   * From now on `systeminformation` answers this user (and system id), as a
   * session of that SAP user would; a later call switches the user. `null`:
   * the endpoint is absent (`404`); `undefined`: no longer set, so `answer`
   * and `body` decide again. Takes precedence over `body`.
   */
  systemInformation(user: string | null | undefined, systemId?: string): void;
  /**
   * From now on a request carrying `session`'s cookie runs in a new session,
   * whose cookie it is answered with: SAP ended the old one (its idle
   * timeout) and opened another, as it does after the old one is gone.
   */
  endSession(session: string): void;
  /** The logoffs received so far: `disconnect()` reached the system. */
  logoffs(): number;
  /** The sessions logged off so far, in order. */
  loggedOff(): string[];
  close(): Promise<void>;
}

/**
 * What `systeminformation` answers when a suite states nothing: a valid
 * system, naming its user and system id.
 */
export const DEFAULT_SYSTEM_INFORMATION = JSON.stringify({
  userName: 'STAND_IN_USER',
  systemID: 'STD',
});

/** Whether `url` is the platform's logoff (`/sap/public/bc/icf/logoff`). */
export const isLogoff = (url: string): boolean => url.includes('logoff');

/** A request held at the stand-in. */
export interface StandInHold {
  /** Resolves when the held request has arrived. */
  arrived: Promise<void>;
  /** Answers the held request (and any held later, if it has not come yet). */
  release(): void;
}

export const PROBE_PATH = '/sap/bc/adt/probe/';

const SESSION_COOKIE = 'SAP_SESSIONID_X01_100';

/** The session a request's `Cookie` names, if any. */
function sessionOf(cookie: string | undefined): string | undefined {
  for (const part of (cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === SESSION_COOKIE) {
      const value = part.slice(at + 1).trim();
      if (value !== '') return value;
    }
  }
  return undefined;
}

export async function adtStandIn(): Promise<AdtStandIn> {
  const requests: StandInRequest[] = [];
  let refusing = false;
  const answers: Array<{
    match: (request: StandInRequest) => boolean;
    status: number;
    /** An ADT exception document, answered as `application/xml`. */
    text?: string;
    once?: boolean;
    used?: boolean;
  }> = [];
  const holds: Array<{
    match: (request: StandInRequest) => boolean;
    taken: boolean;
    arrive: () => void;
    released: Promise<void>;
    release: () => void;
  }> = [];
  const responders: Array<{
    match: (request: StandInRequest) => boolean;
    respond: (request: StandInRequest) => StandInResponse;
  }> = [];
  const bodies: Array<{
    match: (request: StandInRequest) => boolean;
    text: string;
    headers?: Record<string, string>;
  }> = [];
  let sessions = 0;
  /** The sessions SAP ended (`endSession`): their cookie opens a new one. */
  const ended = new Set<string>();
  /** What `systemInformation` set: the user, or `null` for a `404`. */
  let systemInfo: { user: string | null; systemId: string } | undefined;
  const server = http.createServer((req, res) => {
    const carried = sessionOf(req.headers.cookie);
    const session =
      carried !== undefined && !ended.has(carried)
        ? carried
        : `session-${++sessions}`;
    const sessionType = req.headers['x-sap-adt-sessiontype'];
    const contentType = req.headers['content-type'];
    const request: StandInRequest = {
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
      session,
      sessionType: Array.isArray(sessionType) ? sessionType[0] : sessionType,
      cookie: req.headers.cookie,
      contentType,
      accept: req.headers.accept,
      body: '',
    };
    requests.push(request);
    const hold = holds.find((h) => !h.taken && h.match(request));
    if (hold) {
      hold.taken = true;
      hold.arrive();
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      request.body = Buffer.concat(chunks).toString('utf8');
      if (hold) await hold.released;
      if (refusing) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('');
        return;
      }
      const responder = responders.find((r) => r.match(request));
      if (responder) {
        const answered = responder.respond(request);
        res.writeHead(answered.status, {
          'content-type': 'text/plain',
          ...answered.headers,
          'set-cookie': [`${SESSION_COOKIE}=${session}; path=/`],
        });
        res.end(answered.text ?? '');
        return;
      }
      if (
        systemInfo !== undefined &&
        request.url.startsWith('/sap/bc/adt/core/http/systeminformation')
      ) {
        const user = systemInfo.user;
        if (user === null) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('');
          return;
        }
        res.writeHead(200, {
          'content-type': 'text/plain',
          'x-csrf-token': 'csrf-placeholder',
          'set-cookie': [`${SESSION_COOKIE}=${session}; path=/`],
        });
        res.end(
          JSON.stringify({
            systemID: systemInfo.systemId,
            userName: user,
          }),
        );
        return;
      }
      const given = answers.find((a) => !a.used && a.match(request));
      if (given) {
        if (given.once) given.used = true;
        res.writeHead(given.status, {
          'content-type':
            given.text !== undefined ? 'application/xml' : 'text/plain',
        });
        res.end(given.text ?? '');
        return;
      }
      // A valid ABAP system's systeminformation names the session's user:
      // the default when a suite states none (`body`, `systemInformation`).
      const said =
        bodies.find((b) => b.match(request)) ??
        (request.url.startsWith('/sap/bc/adt/core/http/systeminformation')
          ? { text: DEFAULT_SYSTEM_INFORMATION, headers: undefined }
          : undefined);
      // A cookie a suite has the answer set (`body`'s headers) goes beside
      // the session's own.
      const { 'set-cookie': extraCookie, ...saidHeaders } = said?.headers ?? {};
      res.writeHead(200, {
        ...saidHeaders,
        'content-type': 'text/plain',
        'x-csrf-token': 'csrf-placeholder',
        // An ABAP session: what a connection needs before it reports connected.
        'set-cookie': [
          `${SESSION_COOKIE}=${session}; path=/`,
          ...(extraCookie !== undefined ? [extraCookie] : []),
        ],
      });
      // A lock answers a real lock handle, so a write's lock → update →
      // unlock runs through the real clients.
      res.end(
        said?.text ??
          (request.url.includes('_action=LOCK') ? LOCK_SUCCESS_XML : ''),
      );
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
    answer: (match, status, text) => {
      answers.push({ match, status, ...(text !== undefined && { text }) });
    },
    respond: (match, respond) => {
      responders.push({ match, respond });
    },
    answerOnce: (match, status) => {
      answers.push({ match, status, once: true });
    },
    body: (match, text, headers) => {
      bodies.push({ match, text, headers });
    },
    systemInformation: (user, systemId = 'SID') => {
      systemInfo = user === undefined ? undefined : { user, systemId };
    },
    endSession: (session) => {
      ended.add(session);
    },
    logoffs: () => requests.filter((r) => isLogoff(r.url)).length,
    loggedOff: () =>
      requests.filter((r) => isLogoff(r.url)).map((r) => r.session),
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
