/**
 * The core shutdown's unit harness: a fake process, a factory and an
 * instance that record what the sequence asks of them, and the registry's
 * own calls standing in for running tools. Nothing here starts a server.
 */

import { EventEmitter } from 'node:events';
import {
  registerActiveTool,
  resetProcessLatchForTests,
} from '../../../../src/lib/activeTools';
import type { SettleReport } from '../../auth/IAuthBrokerFactory.js';
import { installShutdown } from '../../shutdown.js';

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export const tick = () => new Promise((r) => setImmediate(r));

export async function turns(n = 10): Promise<void> {
  for (let i = 0; i < n; i += 1) await tick();
}

export function fakeProcess() {
  return Object.assign(new EventEmitter(), { stdin: new EventEmitter() });
}

/** A running tool in the one registry: `end()` settles it; `signal` is its call's. */
export function runningTool(
  name = 'UpdateClass',
  instance?: object,
): { end: () => void; signal: { readonly aborted: boolean } } {
  const controller = new AbortController();
  const remove = registerActiveTool(controller, { instance, name });
  if (remove === undefined) throw new Error('the registry is latched');
  return { end: remove, signal: controller.signal };
}

export interface CoreHarness {
  run: () => Promise<void>;
  order: string[];
  exits: number[];
  stderr: string[];
  processLike: ReturnType<typeof fakeProcess>;
  settleSignal: () => AbortSignal | undefined;
}

export function setup(
  options: {
    settle?: () => Promise<SettleReport>;
    shutdownTimeoutMs?: number;
    onStdinEnd?: boolean;
  } = {},
): CoreHarness {
  resetProcessLatchForTests();
  const order: string[] = [];
  const exits: number[] = [];
  const stderr: string[] = [];
  let signal: AbortSignal | undefined;
  const processLike = fakeProcess();
  const run = installShutdown({
    factory: {
      beginShutdown: () => order.push('begin'),
      endLogins: async () => {},
      settle: async (o) => {
        signal = o?.signal;
        order.push('settle');
        const report = await (options.settle?.() ??
          Promise.resolve({ notStored: [] }));
        order.push('settled');
        return report;
      },
    },
    instance: {
      close: async () => {
        order.push('mcp close');
      },
    },
    onStdinEnd: options.onStdinEnd ?? true,
    exit: (code) => {
      order.push(`exit(${code})`);
      exits.push(code);
    },
    stderr: (line) => stderr.push(line),
    processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
  return {
    run,
    order,
    exits,
    stderr,
    processLike,
    settleSignal: () => signal,
  };
}
