/**
 * The system kind is required, never guessed: `mcp-abap-adt-sse` (and the
 * -ro and compact commands, which are this launcher with their own set)
 * takes it from `--system-type`, `SAP_SYSTEM_TYPE` or YAML `system-type`.
 * Without it the start ends with exit 1 in fixed words, before anything
 * listens — so no tool list is ever filtered for a kind nobody stated.
 */

import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { listenerSystemTypeRequiredWords } from '@mcp-abap-adt/responsible-rules';
import { main } from '../launcher';

jest.setTimeout(30_000);

const savedEnv = process.env;
afterEach(() => {
  process.env = savedEnv;
});

/** A port nothing listens on now. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** Whether something listens on `port`: binding it is the proof. */
async function listening(port: number): Promise<boolean> {
  const probe = createServer();
  return new Promise<boolean>((resolve) => {
    probe.once('error', () => resolve(true));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });
}

async function start(argv: string[], env: NodeJS.ProcessEnv) {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(savedEnv)) {
    if (!key.startsWith('SAP_') && !key.startsWith('MCP_')) clean[key] = value;
  }
  process.env = { ...clean, ...env };
  const stderr: string[] = [];
  const exits: number[] = [];
  const server = await main(
    { toolSet: fullToolSet, program: 'mcp-abap-adt-sse', version: '0.0.0' },
    {
      argv,
      stdout: () => {},
      stderr: (line) => stderr.push(line),
      exit: (code) => exits.push(code),
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
    },
  );
  return { server, stderr, exits };
}

it('without a kind: exit 1 in fixed words, and nothing listens', async () => {
  const port = await freePort();
  const { server, stderr, exits } = await start(
    ['--sse-host=127.0.0.1', `--sse-port=${port}`],
    {},
  );
  expect(server).toBeUndefined();
  expect(exits).toEqual([1]);
  expect(stderr).toEqual([`[MCP] ${listenerSystemTypeRequiredWords()}`]);
  expect(await listening(port)).toBe(false);
});

it.each([
  ['--system-type', ['--system-type=onprem'], {}],
  ['SAP_SYSTEM_TYPE', [], { SAP_SYSTEM_TYPE: 'cloud' }],
] as const)('stated by %s: it listens', async (_what, extra, env) => {
  const port = await freePort();
  const { server, exits } = await start(
    ['--sse-host=127.0.0.1', `--sse-port=${port}`, ...extra],
    { ...env },
  );
  try {
    expect(exits).toEqual([]);
    expect(server).toBeDefined();
    expect(await listening(port)).toBe(true);
  } finally {
    await server?.stop();
  }
  expect(await listening(port)).toBe(false);
});
