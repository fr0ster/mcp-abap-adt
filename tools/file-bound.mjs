// The runner's per-file bound (`tools/run-tests.mjs --file-timeout`): which
// files may be bounded, how a file's process tree is ended, how one file's
// process is watched against its bound, and a write that settles only once
// flushed. Plain code, no regular expression. The runner's tests load it in a
// child process of their own (`fileBoundParts.test.ts`).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * The most seconds a bound may hold: a timer's delay is a signed 32-bit
 * count of milliseconds, and a larger one fires at once.
 */
export const MAX_BOUND_SECONDS = 2147483;

/**
 * Whether `file` is a live or integration suite's file, by where it is on
 * disk, whatever repository the runner was told to walk: its canonical path
 * has a `__tests__` directory whose next directory is `integration` or
 * `admin` (the live roots, `src/__tests__/integration` and
 * `src/__tests__/admin`, and their compiled tree under `.test-build/tree/`).
 * A path that cannot be resolved is read as written. On Windows (`platform`
 * `win32`) the names are compared ignoring case, as its file system does.
 */
export function isLiveFile(file, platform = process.platform) {
  let canonical = file;
  try {
    canonical = realpathSync(file);
  } catch {
    // Read as written.
  }
  const parts = folded(canonical, platform)
    .split(sep)
    .flatMap((part) => part.split('/'))
    .flatMap((part) => part.split('\\'));
  for (let i = 0; i + 1 < parts.length; i += 1) {
    if (
      parts[i] === '__tests__' &&
      (parts[i + 1] === 'integration' || parts[i + 1] === 'admin')
    ) {
      return true;
    }
  }
  return false;
}

/** `text` as the platform's file system compares it: lower case on Windows. */
function folded(text, platform) {
  return platform === 'win32' ? text.toLowerCase() : text;
}

/**
 * Whether `source` (a repository path written with `/`) is under one of
 * `roots` (the live roots), compared as the platform's file system compares
 * names: ignoring case on Windows, where `SRC/__TESTS__/INTEGRATION/…`
 * names the same file.
 */
export function isLiveSource(source, roots, platform = process.platform) {
  const text = folded(source, platform);
  return roots.some((root) => text.startsWith(`${folded(root, platform)}/`));
}

/** The integer `text` is written in decimal digits, or undefined. */
function digitsValue(text) {
  if (text === '') return undefined;
  let value = 0;
  for (const character of text) {
    const digit = '0123456789'.indexOf(character);
    if (digit < 0) return undefined;
    value = value * 10 + digit;
  }
  return value;
}

/**
 * `ps -A -o pid=,ppid=`'s answer as [pid, parent pid] pairs: each line two
 * fields of digits separated by blanks; any other line is skipped.
 */
export function parseProcessTable(text) {
  const pairs = [];
  for (const line of text.split('\n')) {
    const fields = line
      .split(' ')
      .flatMap((field) => field.split('\t'))
      .filter((field) => field !== '');
    if (fields.length !== 2) continue;
    const pid = digitsValue(fields[0]);
    const parent = digitsValue(fields[1]);
    if (pid !== undefined && parent !== undefined) pairs.push([pid, parent]);
  }
  return pairs;
}

/** Every descendant of `root` in `pairs` ([pid, parent pid]), at any depth. */
export function descendantsOf(root, pairs) {
  const found = [];
  const known = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, parent] of pairs) {
      if (known.has(parent) && !known.has(pid)) {
        known.add(pid);
        found.push(pid);
        grew = true;
      }
    }
  }
  return found;
}

/** Sends `signal` to `target`; a process already gone is no failure. */
function signal(target, name) {
  try {
    process.kill(target, name);
    return undefined;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null
        ? Reflect.get(error, 'code')
        : undefined;
    return code === 'ESRCH' ? undefined : `${name} to ${target}: ${code}`;
  }
}

/** The process table now, or the reason it could not be read. */
function processTable() {
  const run = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (run.error !== undefined) return { problem: `ps: ${run.error.message}` };
  if (run.status !== 0) return { problem: `ps exited ${run.status}` };
  return { pairs: parseProcessTable(run.stdout) };
}

/**
 * Ends the process tree of `pid`, which leads a process group of its own,
 * as the tree is when this is called: on Windows `taskkill /T /F`;
 * elsewhere every descendant then in the process table under `pid` is
 * stopped (`SIGSTOP`), the table read again until no new one appears, so
 * none forks or leaves meanwhile, whatever group or session it is in; then
 * the group and each process found get `SIGKILL`. The limit: a descendant
 * that left the tree before this call — reparented away when the process
 * that started it exited — is no longer under `pid` and is not reached.
 * Answers `{ ok: true }`, or `{ ok: false, reason }` when the tree could
 * not be ended whole (the group is still killed when the table cannot be
 * read). A `pid` of 1 or less is refused: `-1` would signal every process.
 */
export function endTree(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    return { ok: false, reason: `no process tree to end at pid ${pid}` };
  }
  if (process.platform === 'win32') {
    const run = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (run.error !== undefined) {
      return { ok: false, reason: `taskkill: ${run.error.message}` };
    }
    // 128: no such process — it has ended already.
    if (run.status !== 0 && run.status !== 128) {
      return {
        ok: false,
        reason: `taskkill exited ${run.status}: ${`${run.stdout}${run.stderr}`.trim()}`,
      };
    }
    return { ok: true };
  }
  const problems = [];
  const tree = new Set([pid]);
  const note = (problem) => {
    if (problem !== undefined) problems.push(problem);
  };
  note(signal(-pid, 'SIGSTOP'));
  note(signal(pid, 'SIGSTOP'));
  for (let round = 0; round < 100; round += 1) {
    const table = processTable();
    if (table.problem !== undefined) {
      problems.push(table.problem);
      break;
    }
    const fresh = descendantsOf(pid, table.pairs).filter(
      (one) => !tree.has(one),
    );
    if (fresh.length === 0) break;
    for (const one of fresh) {
      tree.add(one);
      note(signal(one, 'SIGSTOP'));
    }
  }
  note(signal(-pid, 'SIGKILL'));
  for (const one of tree) note(signal(one, 'SIGKILL'));
  return problems.length === 0
    ? { ok: true }
    : { ok: false, reason: problems.join('; ') };
}

/**
 * Watches `child` (a `ChildProcess`, spawned) until it is done, and settles
 * once, with:
 * - `{ outcome: 'ended', code }` when it closed with `code` (a missing code
 *   is 1) before the bound — or after it with `0`: a file that exits `0`
 *   while being stopped has passed;
 * - `{ outcome: 'stopped' }` when the bound expired first and the child
 *   then closed otherwise; the stop is known only once the close is seen;
 * - `{ outcome: 'unkillable', reason }` when `end(child)` could not end
 *   its tree: settled at once, never waiting on a child that may not end;
 * - `{ outcome: 'error', error }` when it could not start.
 * With `seconds` undefined there is no bound. The bound's timer is
 * unreferenced and cleared when the watch settles; a child that has exited
 * when it fires is not ended.
 */
export function watchFile(child, seconds, end) {
  return new Promise((settle) => {
    let exited = false;
    let expired = false;
    let done = false;
    let timer;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle(result);
    };
    if (seconds !== undefined) {
      timer = setTimeout(() => {
        if (exited) return;
        expired = true;
        const ended = end(child);
        if (!ended.ok) finish({ outcome: 'unkillable', reason: ended.reason });
      }, seconds * 1000);
      timer.unref();
    }
    child.on('exit', () => {
      exited = true;
    });
    child.on('error', (error) => finish({ outcome: 'error', error }));
    child.on('close', (code) => {
      if (expired && code !== 0) finish({ outcome: 'stopped' });
      else finish({ outcome: 'ended', code: code ?? 1 });
    });
  });
}

/** Writes `text` to `stream`, settling once it is flushed. */
export function writeFlushed(stream, text) {
  return new Promise((done) => {
    stream.write(text, () => done());
  });
}
