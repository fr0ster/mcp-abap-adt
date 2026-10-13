/**
 * Leftover sessions for the transports' suites: a session a killed process
 * left behind — connected at the ADT stand-in, kept in a runtime file by an
 * owner of another pid, never logged off — and the process probe that says
 * which pids still run.
 */

import * as fs from 'node:fs';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { createAbapConnection } from '../../lib/connectionFactory';
import {
  type LeftoverRole,
  LeftoverSessions,
  sessionIdentity,
} from '../../lib/leftoverSessions/LeftoverSessions';
import type { ProcessProbe } from '../../lib/leftoverSessions/processStamp';

/** A probe that says this process is `self` and that `alive` pids run. */
export function fakeProbe(
  self: number,
  alive: ReadonlySet<number> = new Set(),
): ProcessProbe {
  return {
    self: () => ({ pid: self, start: `start-${self}` }),
    isAlive: (stamp) =>
      (stamp.pid === self || alive.has(stamp.pid)) &&
      stamp.start === `start-${stamp.pid}`,
  };
}

/** The handles in `dir`, sorted; none when it does not exist. */
export function runtimeFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/**
 * The session a killed process `pid` left: `user`'s, on `url` client `100`,
 * kept in `dir`. Answers its handle.
 */
export async function killedProcessSession(
  url: string,
  dir: string,
  options: { user: string; pid?: number; role?: LeftoverRole },
): Promise<string> {
  const killed = new LeftoverSessions({
    directory: dir,
    probe: fakeProbe(options.pid ?? 111),
    report: () => {},
  });
  const before = new Set(runtimeFiles(dir));
  const settings = {
    url,
    client: '100',
    authType: 'basic' as const,
    username: options.user,
  };
  const connection = createAbapConnection(
    settings,
    new BasicAuthProvider(options.user, 'left-password'),
  );
  await (connection as unknown as { connect(): Promise<void> }).connect();
  const identity = sessionIdentity(settings);
  if (identity === undefined) throw new Error('no identity');
  killed.track(connection, options.role ?? 'built', identity);
  const handle = runtimeFiles(dir).find((f) => !before.has(f));
  if (handle === undefined) throw new Error('no file was written');
  return handle;
}
