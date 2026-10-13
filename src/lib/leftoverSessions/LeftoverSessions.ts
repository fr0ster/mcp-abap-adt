/**
 * The SAP sessions a server process holds, kept as files so that a process
 * killed from outside (`SIGKILL`, OOM, a host that kills its child) leaves
 * them behind for the user to see — and to resume or log off, through the
 * three leftover-session tools. The server decides nothing by itself: it
 * resumes nothing, logs off nothing and picks nothing unless the user asks.
 *
 * **The owner.** One object per process, created by the host (the launcher,
 * or an embedder) and handed to its server instances; no module global. An
 * instance without one keeps no file and answers the tools "not available
 * here".
 *
 * **The runtime file.** `<config dir>/runtime/` (`runtimeDirectory`), the
 * directory `0700`, each file `0600`, named by its session's handle (128
 * random bits). One per owned HTTP connection that holds a session: an
 * instance's own (`built`) and each debugger connection (`debugger`). It
 * holds the writing process (pid and start time), the role, the destination
 * identity (URL, client, system kind, wire), the backend user and the
 * session's cookies (`sessionCookies()`). Written once the connection holds
 * a session and again after a request whose answer changed its cookies;
 * deleted once that connection's logoff is written — so it survives only a
 * process that died without its logoff. Never logged, never shown to the
 * model: the cookies act as the user while the session lives.
 *
 * RFC connections get no file: an RFC session is its conversation (a
 * socket) and cannot be picked up by another process.
 *
 * **Whose file.** A file is the caller's when its destination identity and
 * backend user equal what the caller's request resolved; someone else's file
 * and an unknown handle get the same answer: not available. A file whose
 * process is alive (pid and start time) is never listed or touched — it is
 * that process's, this one's included. No TTL: a file stays until the user
 * acts, and SAP's answer decides whether its session is alive.
 *
 * **Claims.** Before a resume or a logoff, a process claims the file by
 * renaming it to `<handle>.claimed.<pid>.<start>`: an atomic rename, so of
 * two processes one acts and the other answers "not available". A claimed
 * file whose claimer died is available again, as any dead process's file.
 *
 * **The backend user** is the one the request names (`SAP_USERNAME`,
 * `x-sap-login`); a token credential names none, and the user is then the
 * one SAP answers for the session (`systemUserOf`, asked after `connect()`).
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { resolveSystemKind } from '../connectionFactory';
import { isEnded, whenLoggedOff } from '../ownedConnections';
import {
  nodeProcessProbe,
  type ProcessProbe,
  type ProcessStamp,
} from './processStamp';

/** What a held session is to its instance. */
export type LeftoverRole = 'built' | 'debugger';

/** Who a session belongs to: the destination and the backend user. */
export interface SessionIdentity {
  /** The system's URL, without a trailing slash. */
  url: string;
  /** The client; `''` when none is stated. */
  client: string;
  system: 'onprem' | 'cloud';
  /** Only HTTP sessions are kept. */
  wire: 'http';
  /** The backend user, upper case. */
  user: string;
}

/** A leftover session, as the list tool shows it: no cookie. */
export interface LeftoverListing {
  handle: string;
  role: LeftoverRole;
  destination: { url: string; client: string; system: 'onprem' | 'cloud' };
  user: string;
  written_at: string;
}

/**
 * A leftover session claimed for one operation of this process: its file
 * renamed to a name carrying this process (`<handle>.claimed.<pid>.<start>`),
 * so another process cannot act on it at the same time.
 */
export interface ClaimedSession {
  handle: string;
  role: LeftoverRole;
  /** The session's cookies: a secret, handed only to the connection. */
  cookies: string;
  /** The claimed file's name in the runtime directory. */
  file: string;
}

/** Where a session's destination is, without its user. */
export type SessionDestination = Omit<SessionIdentity, 'user'>;

/** What the file holds. */
interface RuntimeFile {
  format: 1;
  pid: number;
  start: string | null;
  role: LeftoverRole;
  destination: {
    url: string;
    client: string;
    system: 'onprem' | 'cloud';
    wire: 'http';
  };
  user: string;
  cookies: string;
  written_at: string;
}

/** A connection whose session this process keeps a file of. */
interface Tracked {
  handle: string;
  role: LeftoverRole;
  identity: SessionIdentity;
  /** The cookies last written; `null` before the first write. */
  cookies: string | null;
  /** Its logoff was written: nothing is written for it any more. */
  ended: boolean;
}

/** The fixed words of a runtime file that could not be written or deleted. */
export const RUNTIME_FILE_FAILED_WORDS =
  '[MCP] A runtime file of a held SAP session could not be written or deleted';

const HEX = '0123456789abcdef';

/** A handle: 32 lower-case hex digits (128 bits). Plain code. */
export function isHandle(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 32) return false;
  for (const c of value) if (!HEX.includes(c)) return false;
  return true;
}

function newHandle(): string {
  return randomBytes(16).toString('hex');
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

/**
 * The identity a request resolved: its settings and its login (the
 * destination's `SAP_USERNAME`, an `x-sap-login`). `undefined` over RFC, and
 * when no backend user is stated — a token credential names none — so such
 * a session keeps no file and such a caller owns none.
 */
export function sessionIdentity(
  settings: SapConfig,
  login?: string,
): SessionIdentity | undefined {
  const destination = sessionDestination(settings);
  return destination === undefined
    ? undefined
    : withUser(destination, settings.username ?? login);
}

/**
 * The destination a request's settings name (URL, client, system kind, the
 * HTTP wire), without a user; `undefined` over RFC — an RFC session is its
 * conversation and keeps no file.
 */
export function sessionDestination(
  settings: SapConfig,
): SessionDestination | undefined {
  if (settings.connectionType === 'rfc') return undefined;
  if (typeof settings.url !== 'string') return undefined;
  return {
    url: withoutTrailingSlashes(settings.url.trim()),
    client: (settings.client ?? '').trim(),
    system: resolveSystemKind(settings),
    wire: 'http',
  };
}

/**
 * `destination` with its backend user — stated by the request, or answered
 * by SAP for a token credential (`systemUserOf`); `undefined` without one.
 */
export function withUser(
  destination: SessionDestination,
  user: string | undefined,
): SessionIdentity | undefined {
  const named = (user ?? '').trim().toUpperCase();
  return named === '' ? undefined : { ...destination, user: named };
}

/** A runtime file's name: `<handle>`, or `<handle>.claimed.<pid>.<start in hex>`. */
interface FileName {
  name: string;
  handle: string;
  /** The process that claimed it, when it is claimed. */
  claimer?: ProcessStamp;
}

const CLAIMED = '.claimed.';

function claimedName(handle: string, by: ProcessStamp): string {
  const start = by.start === null ? '' : Buffer.from(by.start).toString('hex');
  return `${handle}${CLAIMED}${by.pid}.${start}`;
}

/** A runtime file's name read back; `undefined` for anything else. Plain code. */
function parseName(name: string): FileName | undefined {
  if (name.length === 32) {
    return isHandle(name) ? { name, handle: name } : undefined;
  }
  const handle = name.slice(0, 32);
  if (!isHandle(handle) || !name.startsWith(CLAIMED, 32)) return undefined;
  const rest = name.slice(32 + CLAIMED.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return undefined;
  const pidText = rest.slice(0, dot);
  const hex = rest.slice(dot + 1);
  for (const c of pidText) if (c < '0' || c > '9') return undefined;
  if (hex.length % 2 !== 0) return undefined;
  for (const c of hex) if (!HEX.includes(c)) return undefined;
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid)) return undefined;
  return {
    name,
    handle,
    claimer: {
      pid,
      start: hex === '' ? null : Buffer.from(hex, 'hex').toString(),
    },
  };
}

function sameIdentity(a: SessionIdentity, b: SessionIdentity): boolean {
  return (
    a.url === b.url &&
    a.client === b.client &&
    a.system === b.system &&
    a.wire === b.wire &&
    a.user === b.user
  );
}

/** The connection's session cookies, read structurally; `null` without. */
function cookiesOf(connection: object): string | null {
  const reader = (connection as { sessionCookies?: () => string | null })
    .sessionCookies;
  if (typeof reader !== 'function') return null;
  try {
    const cookies = reader.call(connection);
    return typeof cookies === 'string' && cookies !== '' ? cookies : null;
  } catch {
    return null;
  }
}

/** A parsed file, or `undefined` for anything that is not one. */
function parseFile(text: string): RuntimeFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const file = value as Partial<RuntimeFile> | null;
  const destination = file?.destination as
    | Partial<RuntimeFile['destination']>
    | undefined;
  if (
    file === null ||
    typeof file !== 'object' ||
    file.format !== 1 ||
    typeof file.pid !== 'number' ||
    !(file.start === null || typeof file.start === 'string') ||
    (file.role !== 'built' && file.role !== 'debugger') ||
    typeof destination !== 'object' ||
    destination === null ||
    typeof destination.url !== 'string' ||
    typeof destination.client !== 'string' ||
    (destination.system !== 'onprem' && destination.system !== 'cloud') ||
    destination.wire !== 'http' ||
    typeof file.user !== 'string' ||
    typeof file.cookies !== 'string' ||
    file.cookies === '' ||
    typeof file.written_at !== 'string'
  ) {
    return undefined;
  }
  return file as RuntimeFile;
}

function identityOfFile(file: RuntimeFile): SessionIdentity {
  return {
    url: file.destination.url,
    client: file.destination.client,
    system: file.destination.system,
    wire: file.destination.wire,
    user: file.user,
  };
}

export interface LeftoverSessionsOptions {
  /** The runtime directory (`runtimeDirectory()`). */
  directory: string;
  /** Who this process is and whether another lives; default this machine's. */
  probe?: ProcessProbe;
  /** The clock of `written_at`. */
  now?: () => Date;
  /** Where a failed write or delete is said, in fixed words; default stderr. */
  report?: (line: string) => void;
}

export class LeftoverSessions {
  readonly directory: string;
  private readonly probe: ProcessProbe;
  private readonly now: () => Date;
  private readonly report: (line: string) => void;
  /** Keyed weakly: each kept connection's file. */
  private readonly tracked = new WeakMap<object, Tracked>();
  /** Keyed weakly: what each connection was built for, so a sibling inherits it. */
  private readonly identities = new WeakMap<object, SessionIdentity>();

  constructor(options: LeftoverSessionsOptions) {
    this.directory = options.directory;
    this.probe = options.probe ?? nodeProcessProbe();
    this.now = options.now ?? (() => new Date());
    this.report =
      options.report ??
      ((line) => {
        process.stderr.write(`${line}\n`);
      });
  }

  /** The identity `connection` was built for, if it was recorded. */
  identityOf(connection: object): SessionIdentity | undefined {
    return this.identities.get(connection);
  }

  /**
   * Keeps a file of `connection`'s session from now on, under `handle` (a
   * new one by default): written now if it holds a session, again after a
   * request whose answer changed its cookies, deleted once its logoff is
   * written. A connection already ended, or already kept, is left alone.
   */
  track(
    connection: object,
    role: LeftoverRole,
    identity: SessionIdentity,
    handle: string = newHandle(),
  ): void {
    this.identities.set(connection, identity);
    if (isEnded(connection) || this.tracked.has(connection)) return;
    const entry: Tracked = {
      handle,
      role,
      identity,
      cookies: null,
      ended: false,
    };
    this.tracked.set(connection, entry);
    whenLoggedOff(connection, () => {
      entry.ended = true;
      if (entry.cookies !== null) this.remove(entry.handle);
    });
    this.watch(connection);
    this.refresh(connection);
  }

  /**
   * Keeps a file of a connection opened beside `origin` (a debugger's own),
   * for the identity `origin` was built for. Nothing when that is unknown.
   */
  trackSibling(connection: object, role: LeftoverRole, origin: object): void {
    const identity = this.identities.get(origin);
    if (identity !== undefined) this.track(connection, role, identity);
  }

  /** The caller's leftover sessions: dead processes' files of `identity`. */
  list(identity: SessionIdentity): LeftoverListing[] {
    const listed: LeftoverListing[] = [];
    const seen = new Set<string>();
    for (const entry of this.available()) {
      if (seen.has(entry.handle)) continue;
      const file = this.read(entry.name);
      if (file === undefined || this.alive(file)) continue;
      if (!sameIdentity(identityOfFile(file), identity)) continue;
      seen.add(entry.handle);
      listed.push({
        handle: entry.handle,
        role: file.role,
        destination: {
          url: file.destination.url,
          client: file.destination.client,
          system: file.destination.system,
        },
        user: file.user,
        written_at: file.written_at,
      });
    }
    return listed.sort((a, b) => a.written_at.localeCompare(b.written_at));
  }

  /**
   * The leftover session `handle` names, claimed for one operation of this
   * process — or `undefined`, the same for an unknown handle, someone
   * else's file, a live process's file and one another process claimed
   * first. The claim is the file's atomic rename to a name carrying this
   * process: of two processes renaming the same file, one wins and the
   * other finds nothing. A file whose claimer died is available again, as
   * any dead process's file. Ends with `release` (the session stays a
   * leftover), `forget` (it is gone) or `adopt` (resumed here).
   */
  claim(
    handle: unknown,
    identity: SessionIdentity,
  ): ClaimedSession | undefined {
    if (!isHandle(handle)) return undefined;
    const entry = this.available().find((e) => e.handle === handle);
    if (entry === undefined) return undefined;
    const file = this.read(entry.name);
    if (file === undefined || this.alive(file)) return undefined;
    if (!sameIdentity(identityOfFile(file), identity)) return undefined;
    const mine = claimedName(handle, this.probe.self());
    try {
      fs.renameSync(
        path.join(this.directory, entry.name),
        path.join(this.directory, mine),
      );
    } catch {
      // Another process renamed it first.
      return undefined;
    }
    return { handle, role: file.role, cookies: file.cookies, file: mine };
  }

  /** The claimed session stays a leftover: its file is named by its handle again. */
  release(claimed: ClaimedSession): void {
    const target = path.join(this.directory, claimed.handle);
    try {
      // Never over a file of the same handle (one adopted meanwhile).
      if (fs.existsSync(target)) {
        this.removeFile(claimed.file);
        return;
      }
      fs.renameSync(path.join(this.directory, claimed.file), target);
    } catch {
      this.say();
    }
  }

  /** The claimed session is gone, or logged off: its file is deleted. */
  forget(claimed: ClaimedSession): void {
    this.removeFile(claimed.file);
  }

  /**
   * A resumed session is this process's now: `connection` (built on it)
   * keeps the same handle, its file is written as this process's, and the
   * claimed one is deleted.
   */
  adopt(
    claimed: ClaimedSession,
    connection: object,
    identity: SessionIdentity,
  ): void {
    this.track(connection, claimed.role, identity, claimed.handle);
    this.removeFile(claimed.file);
  }

  /** Writes again whatever changed in `connection`'s cookies. */
  private refresh(connection: object): void {
    const entry = this.tracked.get(connection);
    if (entry === undefined || entry.ended || isEnded(connection)) return;
    const cookies = cookiesOf(connection);
    if (cookies === null || cookies === entry.cookies) return;
    if (this.write(entry, cookies)) entry.cookies = cookies;
  }

  /**
   * After each request on `connection`, its cookies are read again: a
   * stateful request brings the context cookie, which a resume needs to
   * reach the context its locks are in.
   */
  private watch(connection: object): void {
    const target = connection as {
      makeAdtRequest?: (...args: unknown[]) => Promise<unknown>;
    };
    const original = target.makeAdtRequest;
    if (typeof original !== 'function') return;
    target.makeAdtRequest = async (...args: unknown[]) => {
      try {
        return await original.apply(connection, args);
      } finally {
        this.refresh(connection);
      }
    };
  }

  private write(entry: Tracked, cookies: string): boolean {
    const self: ProcessStamp = this.probe.self();
    const file: RuntimeFile = {
      format: 1,
      pid: self.pid,
      start: self.start,
      role: entry.role,
      destination: {
        url: entry.identity.url,
        client: entry.identity.client,
        system: entry.identity.system,
        wire: entry.identity.wire,
      },
      user: entry.identity.user,
      cookies,
      written_at: this.now().toISOString(),
    };
    const target = path.join(this.directory, entry.handle);
    const partial = `${target}.partial`;
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      fs.chmodSync(this.directory, 0o700);
      fs.writeFileSync(partial, JSON.stringify(file), { mode: 0o600 });
      fs.chmodSync(partial, 0o600);
      fs.renameSync(partial, target);
      return true;
    } catch {
      try {
        fs.rmSync(partial, { force: true });
      } catch {
        // Nothing more to tidy.
      }
      this.say();
      return false;
    }
  }

  private remove(handle: string): void {
    this.removeFile(handle);
  }

  private removeFile(name: string): void {
    try {
      fs.rmSync(path.join(this.directory, name), { force: true });
    } catch {
      this.say();
    }
  }

  private say(): void {
    try {
      this.report(RUNTIME_FILE_FAILED_WORDS);
    } catch {
      // A reporter that throws changes nothing.
    }
  }

  /**
   * The files no live process works on: every `<handle>`, and every claimed
   * file whose claimer is dead. Plain files first.
   */
  private available(): FileName[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.directory);
    } catch {
      return [];
    }
    const parsed = names
      .map(parseName)
      .filter((entry): entry is FileName => entry !== undefined)
      .filter(
        (entry) =>
          entry.claimer === undefined || !this.stampAlive(entry.claimer),
      );
    return [
      ...parsed.filter((entry) => entry.claimer === undefined),
      ...parsed.filter((entry) => entry.claimer !== undefined),
    ];
  }

  private read(name: string): RuntimeFile | undefined {
    try {
      return parseFile(
        fs.readFileSync(path.join(this.directory, name), 'utf8'),
      );
    } catch {
      return undefined;
    }
  }

  private alive(file: RuntimeFile): boolean {
    return this.stampAlive({ pid: file.pid, start: file.start });
  }

  private stampAlive(stamp: ProcessStamp): boolean {
    try {
      return this.probe.isAlive(stamp);
    } catch {
      // Unknown is alive: a live process's file is never touched.
      return true;
    }
  }
}
