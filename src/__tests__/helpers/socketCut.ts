/**
 * An in-process network cut (#394): while cut, every socket the HTTP and
 * HTTPS agents of this process opened is destroyed, and every socket they
 * open is pointed at `127.0.0.1:9`, where nothing listens, so it fails
 * `ECONNREFUSED` — what a proxy that drops every link does (mcp-test's
 * `offline` mode). The SAP session is not told anything: its cookies stay
 * with the connection, as after a real outage.
 *
 * Installed by `installSocketCut()`, which patches `createConnection` on
 * `http.Agent.prototype` and `https.Agent.prototype` (every agent of the
 * connection's transport is one of them); `uninstall()` puts both back.
 * Nothing is patched before it is installed.
 */
import * as http from 'node:http';
import * as https from 'node:https';
import type { Socket } from 'node:net';

/** Where a cut points a new socket: a port nothing listens on. */
const NOWHERE = { host: '127.0.0.1', port: 9 } as const;

export interface SocketCut {
  /** Cuts: open sockets destroyed, new ones refused. */
  cut(): void;
  /** Ends the cut: new sockets reach their target again. */
  restore(): void;
  /** Whether the network is cut now. */
  readonly isCut: boolean;
  /** Puts the agents' own `createConnection` back. */
  uninstall(): void;
}

type CreateConnection = (...args: unknown[]) => Socket;

/** Patches the agents' `createConnection`; see the module comment. */
export function installSocketCut(): SocketCut {
  const open = new Set<Socket>();
  let isCut = false;
  const prototypes = [http.Agent.prototype, https.Agent.prototype] as const;
  const originals = prototypes.map(
    (prototype) =>
      Reflect.get(prototype, 'createConnection') as CreateConnection,
  );
  prototypes.forEach((prototype, index) => {
    const original = originals[index];
    if (original === undefined) return;
    Reflect.set(
      prototype,
      'createConnection',
      function patched(this: unknown, ...args: unknown[]): Socket {
        const [options, ...rest] = args;
        const target =
          isCut && typeof options === 'object' && options !== null
            ? { ...options, ...NOWHERE }
            : options;
        const socket = original.call(this, target, ...rest);
        open.add(socket);
        socket.once('close', () => open.delete(socket));
        return socket;
      },
    );
  });
  return {
    cut() {
      isCut = true;
      for (const socket of open) socket.destroy();
    },
    restore() {
      isCut = false;
    },
    get isCut() {
      return isCut;
    },
    uninstall() {
      isCut = false;
      prototypes.forEach((prototype, index) => {
        Reflect.set(prototype, 'createConnection', originals[index]);
      });
    },
  };
}
