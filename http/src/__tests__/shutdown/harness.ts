/**
 * The http shutdown stand: a `StreamableHttpServer` listening on 127.0.0.1
 * with the shutdown tools (`shutdownTools.ts`) beside the probe, lib's
 * transport shutdown installed on a fake process, and the ADT stand-in the
 * per-request connections talk to. Every call goes over real HTTP.
 */

import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as net from 'node:net';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { shutdownTools } from '../../../../src/__tests__/helpers/shutdownTools';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { StreamableHttpServer } from '../../StreamableHttpServer.js';

export const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

export async function until(done: () => boolean, limitMs = 10_000) {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((r) => setTimeout(r, 2));
  }
}

export interface HttpStand {
  standIn: AdtStandIn;
  /** The state logger's error lines (a failed undo outside a shutdown). */
  stateErrors: string[];
  mcp: StreamableHttpServer;
  url: string;
  port: number;
  processLike: EventEmitter;
  exits: number[];
  stderr: string[];
  /** Resolves with the first exit code. */
  exited: Promise<number>;
  /**
   * A `tools/call` over HTTP: its status and its answer's text. `headers`
   * replace the basic connection's (`basicHeaders`).
   */
  call(
    name: string,
    args: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<{ status: number; text: string; isError: boolean }>;
  /** Index of the first request whose url `match` accepts; -1 if none. */
  indexOf(match: (url: string) => boolean): number;
  close(): Promise<void>;
}

export const basicHeaders = (url: string) => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'SHUTDOWN_USER',
  'x-sap-password': 'shutdown-password',
});

export async function httpStand(
  options: { shutdownTimeoutMs?: number; stateIdleMinutes?: number } = {},
): Promise<HttpStand> {
  resetProcessLatchForTests();
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const standIn = await adtStandIn();
  const stateErrors: string[] = [];
  const mcp = new StreamableHttpServer(
    new CompositeHandlersRegistry([probeGroup(shutdownTools())]),
    {
      host: '127.0.0.1',
      port: 0,
      stateLogger: {
        error: (line: string) => stateErrors.push(line),
        info() {},
      },
      ...(options.stateIdleMinutes !== undefined && {
        stateIdleMinutes: options.stateIdleMinutes,
      }),
    },
  );
  await mcp.start();
  const listener = (mcp as unknown as { standaloneServer: Server })
    .standaloneServer;
  const port = (listener.address() as AddressInfo).port;
  const processLike = new EventEmitter();
  const exits: number[] = [];
  const stderr: string[] = [];
  let exitedWith!: (code: number) => void;
  const exited = new Promise<number>((r) => {
    exitedWith = r;
  });
  installTransportShutdown({
    begin: () => mcp.beginShutdown(),
    stopListening: () => mcp.stopListening(),
    release: () => mcp.releaseConnections(),
    exit: (code) => {
      exits.push(code);
      exitedWith(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
  const url = `http://127.0.0.1:${port}/mcp/stream/http`;
  let id = 1;
  return {
    standIn,
    stateErrors,
    mcp,
    url,
    port,
    processLike,
    exits,
    stderr,
    exited,
    call: async (name, args, headers) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(headers ?? basicHeaders(standIn.url)),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: id++,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      const raw = await response.text();
      if (response.status !== 200) {
        return { status: response.status, text: raw, isError: true };
      }
      const body = JSON.parse(raw) as {
        result: { content: { text: string }[]; isError?: boolean };
      };
      return {
        status: 200,
        text: body.result.content[0]?.text ?? '',
        isError: !!body.result.isError,
      };
    },
    indexOf: (match) => standIn.requests.findIndex((r) => match(r.url)),
    close: async () => {
      mcp.stopListening();
      listener.closeAllConnections();
      await standIn.close();
      delete process.env.SAP_SYSTEM_TYPE;
    },
  };
}

/**
 * A `tools/call` whose body is written in two halves: the request is
 * accepted (headers and half the body on the wire) before `finish()` sends
 * the rest. Answers the status line and body once finished.
 */
export function halfPost(
  port: number,
  headers: Record<string, string>,
  name: string,
  args: Record<string, unknown>,
): {
  sent: Promise<void>;
  finish(): Promise<{ status: number; body: string }>;
} {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 9001,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const half = Math.floor(body.length / 2);
  const socket = net.connect(port, '127.0.0.1');
  let received = '';
  socket.on('data', (chunk) => {
    received += chunk.toString('utf8');
  });
  const ended = new Promise<void>((r) => socket.on('close', () => r()));
  const lines = [
    'POST /mcp/stream/http HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Content-Type: application/json',
    'Accept: application/json, text/event-stream',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ];
  const sent = new Promise<void>((resolve) => {
    socket.on('connect', () => {
      socket.write(`${lines.join('\r\n')}\r\n\r\n${body.slice(0, half)}`, () =>
        resolve(),
      );
    });
  });
  return {
    sent,
    finish: async () => {
      socket.write(body.slice(half));
      await ended;
      const status = Number(received.split(' ')[1]);
      const at = received.indexOf('\r\n\r\n');
      return { status, body: at >= 0 ? received.slice(at + 4) : '' };
    },
  };
}
