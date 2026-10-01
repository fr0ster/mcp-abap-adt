/**
 * Lock → write → write → unlock on a legacy system (BASIS < 7.50), per wire.
 *
 * The question: with the connection's session control (stateful for LOCK and
 * UNLOCK only, everything else outside the context — connection PR #60), does
 * a write under a lock succeed over HTTP on 7.40, or is RFC the only wire that
 * can edit there? The second write is the one PR #60 found failing on newer
 * systems (`423`, `PAK/058`) while the context cookie leaked into it.
 *
 * Goes through the server's own path: `createAbapConnection` with
 * `SAP_SYSTEM_TYPE=legacy` and `AdtClientLegacy`. A program, because its legacy
 * client overrides nothing but `delete`, so what is measured is the
 * connection, not a client-side workaround.
 *
 * WRITES: creates one program per wire in `$TMP`, and deletes it at the end.
 * The unlock runs in a `finally`, so an aborted run leaves no enqueue behind.
 *
 * Usage:
 *   PATH="$PATH:/c/nwrfcsdk/nwrfcsdk/lib" SAPNWRFC_HOME='C:/nwrfcsdk/nwrfcsdk' \
 *     npx tsx scripts/probe-legacy-lock.ts --env <path-to.env> [--wires rfc,http]
 */
import * as path from 'node:path';
import { AdtClientLegacy } from '@mcp-abap-adt/adt-clients';
import type { SapConfig } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { createAbapConnection } from '../src/lib/connectionFactory';

type Wire = 'rfc' | 'http';

const PACKAGE = '$TMP';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function source(name: string, line: string): string {
  return `REPORT ${name.toLowerCase()}.\nWRITE '${line}'.\n`;
}

/** What a step answered: an IAdtResponse, or what it threw. */
function describe(answer: unknown): { ok: boolean; note: string } {
  const a = answer as {
    ok?: boolean;
    getError?: () => { message?: string };
  };
  if (a && typeof a === 'object' && 'ok' in a) {
    return a.ok
      ? { ok: true, note: 'ok' }
      : { ok: false, note: a.getError?.().message ?? 'refused' };
  }
  return { ok: true, note: 'ok' };
}

async function probe(wire: Wire): Promise<string[]> {
  const lines: string[] = [];
  const name = `ZMCP_BLD_LCK_${wire === 'rfc' ? 'R' : 'H'}`;
  const connection = createAbapConnection({
    url: process.env.SAP_URL,
    client: process.env.SAP_CLIENT,
    username: process.env.SAP_USERNAME,
    password: process.env.SAP_PASSWORD,
    authType: 'basic',
    connectionType: wire,
  } as SapConfig);
  const program = new AdtClientLegacy(connection).getProgram();
  const config = { programName: name };

  const step = async (label: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const answer = await fn();
      const { ok, note } = describe(answer);
      lines.push(
        `${wire.padEnd(4)} | ${label.padEnd(22)} | ${ok ? 'OK ' : 'NO '} | ${String(Date.now() - t).padStart(5)} ms | ${note}`,
      );
      return ok ? answer : undefined;
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string };
      lines.push(
        `${wire.padEnd(4)} | ${label.padEnd(22)} | ERR | ${String(Date.now() - t).padStart(5)} ms | ${err.response?.status ?? ''} ${err.message ?? e}`,
      );
      return undefined;
    }
  };

  /** The handle a lock answered: `getResult()` is `{ value }`, not a string. */
  const takeLock = async (label: string): Promise<string | undefined> => {
    const answer = (await step(label, () => program.lock(config))) as
      | { getResult: () => { value?: string } }
      | undefined;
    return answer?.getResult().value || undefined;
  };

  /** On 7.40 a delete needs the caller's lock: `lockHandle` is a required parameter. */
  const deleteUnderLock = async (label: string): Promise<void> => {
    const handle = await takeLock(`${label}: lock`);
    if (!handle) return;
    await step(`${label}: delete`, () =>
      program.delete(config, { lockHandle: handle } as never),
    );
  };

  await step('connect', () => connection.connect());
  // A run that stopped before its delete leaves the program behind.
  const leftover = await step('leftover? (read)', () =>
    program.readMetadata(config),
  );
  if (leftover) await deleteUnderLock('leftover');

  await step('create', () =>
    program.create({
      programName: name,
      packageName: PACKAGE,
      description: 'legacy lock probe (safe to delete)',
    }),
  );
  const lockHandle = await takeLock('lock');
  try {
    if (lockHandle) {
      await step('write 1 under the lock', () =>
        program.update(config, {
          lockHandle,
          source: source(name, 'one'),
        } as never),
      );
      await step('write 2 under the lock', () =>
        program.update(config, {
          lockHandle,
          source: source(name, 'two'),
        } as never),
      );
    }
  } finally {
    if (lockHandle) {
      await step('unlock', () => program.unlock(config, lockHandle));
    }
  }
  await step('write without a lock (423?)', () =>
    program.update(config, {
      lockHandle: 'ZZ_NOT_A_HANDLE',
      source: source(name, 'three'),
    } as never),
  );
  await step('read inactive source', () => program.read(config, 'inactive'));
  await step('activate', () => program.activate(config));
  await step('read active source', () => program.read(config, 'active'));
  await deleteUnderLock('cleanup');
  await step('gone? (read)', () => program.readMetadata(config));
  await step('disconnect', () =>
    (connection as unknown as { disconnect: () => Promise<void> }).disconnect(),
  );
  return lines;
}

async function main(): Promise<void> {
  const envFile = arg('--env');
  if (!envFile) throw new Error('--env <path> is required');
  dotenv.config({ path: path.resolve(envFile), override: true });
  process.env.SAP_SYSTEM_TYPE = 'legacy';
  const wires = (arg('--wires') ?? 'rfc,http').split(',') as Wire[];
  const all: string[] = [];
  for (const wire of wires) all.push(...(await probe(wire)));
  console.log(all.join('\n'));
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
