/**
 * The sse shutdown stand: an `SseServer` listening on 127.0.0.1 with the
 * shutdown tools (`shutdownTools.ts`) beside the probe, lib's transport
 * shutdown installed on a fake process, and the ADT stand-in. Each SSE
 * connection is opened raw (`GET /sse`, its `endpoint` event), its calls
 * posted to its endpoint and their answers read off its stream.
 */

import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as net from 'node:net';
import {
  CompositeHandlersRegistry,
  type IHandlerGroup,
} from '@mcp-abap-adt/lib/handlers';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { shutdownTools } from '../../../../src/__tests__/helpers/shutdownTools';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { SseServer, type SseServerOptions } from '../../SseServer.js';

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

export const basicHeaders = (url: string) => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'SHUTDOWN_USER',
  'x-sap-password': 'shutdown-password',
});

/** One raw SSE connection. */
export interface SseConnection {
  sessionId: string;
  postPath: string;
  /** Posts a `tools/call`; answers the POST's status (202 once accepted). */
  call(
    name: string,
    args: Record<string, unknown>,
    id: number,
  ): Promise<number>;
  /** The answer of call `id`, read off the stream. */
  answer(id: number): Promise<{ text: string; isError: boolean }>;
  /** Whether the stream has ended. */
  ended(): boolean;
  /** Closes the connection from the client's side. */
  close(): void;
}

export interface SseStand {
  standIn: AdtStandIn;
  sse: SseServer;
  port: number;
  processLike: EventEmitter;
  exits: number[];
  stderr: string[];
  stateErrors: string[];
  exited: Promise<number>;
  open(): Promise<SseConnection>;
  indexOf(match: (url: string) => boolean): number;
  connects(): number;
  close(): Promise<void>;
}

export async function sseStand(
  options: {
    shutdownTimeoutMs?: number;
    server?: Partial<SseServerOptions>;
    /** Groups served beside the probe and shutdown tools. */
    groups?: IHandlerGroup[];
  } = {},
): Promise<SseStand> {
  resetProcessLatchForTests();
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const standIn = await adtStandIn();
  const stateErrors: string[] = [];
  const sse = new SseServer(
    new CompositeHandlersRegistry([
      probeGroup(shutdownTools()),
      ...(options.groups ?? []),
    ]),
    {
      host: '127.0.0.1',
      port: 0,
      stateLogger: {
        error: (line: string) => stateErrors.push(line),
        info() {},
      },
      ...options.server,
    },
  );
  await sse.start();
  const listener = (sse as unknown as { standaloneServer: Server })
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
    stopListening: () => sse.stopListening(),
    release: () => sse.releaseConnections(),
    exit: (code) => {
      exits.push(code);
      exitedWith(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
  const base = `http://127.0.0.1:${port}`;
  const opened: AbortController[] = [];

  const open = async (): Promise<SseConnection> => {
    const controller = new AbortController();
    opened.push(controller);
    const response = await fetch(`${base}/sse`, {
      headers: basicHeaders(standIn.url),
      signal: controller.signal,
    });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const events: Array<{ event: string; data: string }> = [];
    const pump = (async () => {
      try {
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buffer += decoder
            .decode(value, { stream: true })
            .split('\r')
            .join('');
          for (;;) {
            const at = buffer.indexOf('\n\n');
            if (at < 0) break;
            const block = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            let event = 'message';
            let data = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) event = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            events.push({ event, data });
          }
        }
      } catch {
        // aborted
      } finally {
        done = true;
      }
    })();
    void pump;
    await until(() => events.some((e) => e.event === 'endpoint'));
    const endpoint = events.find((e) => e.event === 'endpoint')?.data ?? '';
    const postUrl = new URL(endpoint, base);
    return {
      sessionId: postUrl.searchParams.get('sessionId') ?? '',
      postPath: `${postUrl.pathname}${postUrl.search}`,
      call: async (name, args, id) => {
        const posted = await fetch(postUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        });
        await posted.text();
        return posted.status;
      },
      answer: async (id) => {
        const find = () =>
          events.find(
            (e) =>
              e.event === 'message' &&
              (JSON.parse(e.data) as { id?: number }).id === id,
          );
        await until(() => find() !== undefined, 20_000);
        const message = JSON.parse(find()?.data ?? '{}') as {
          result: { content: { text: string }[]; isError?: boolean };
        };
        return {
          text: message.result.content[0]?.text ?? '',
          isError: !!message.result.isError,
        };
      },
      ended: () => done,
      close: () => controller.abort(),
    };
  };

  return {
    standIn,
    sse,
    port,
    processLike,
    exits,
    stderr,
    stateErrors,
    exited,
    open,
    indexOf: (match) => standIn.requests.findIndex((r) => match(r.url)),
    connects: () =>
      standIn.requests.filter((r) => r.url.includes('discovery')).length,
    close: async () => {
      for (const controller of opened) controller.abort();
      sse.stopListening();
      listener.closeAllConnections();
      await standIn.close();
      // Each connection's close logs a line once its socket is gone; let it.
      await until(
        () =>
          (sse as unknown as { connections: Map<unknown, unknown> }).connections
            .size === 0,
      ).catch(() => undefined);
      delete process.env.SAP_SYSTEM_TYPE;
    },
  };
}

/**
 * A `tools/call` POST whose body is written in two halves: accepted (headers
 * and half the body on the wire) before `finish()` sends the rest; answers
 * its status.
 */
export function halfPost(
  port: number,
  path: string,
  name: string,
  args: Record<string, unknown>,
  id: number,
): {
  sent: Promise<void>;
  finish(): Promise<{ status: number; body: string }>;
} {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const half = Math.floor(body.length / 2);
  const socket = net.connect(port, '127.0.0.1');
  let received = '';
  socket.on('data', (chunk) => {
    received += chunk.toString('utf8');
  });
  socket.on('error', () => undefined);
  const ended = new Promise<void>((r) => socket.on('close', () => r()));
  const lines = [
    `POST ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
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
