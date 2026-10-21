/**
 * Which process wrote a runtime file, and whether it still lives: its pid
 * and its start time. The pid alone is not enough — a pid is reused once its
 * process is gone, and a file of a dead process must not look alive because
 * another process now carries its number.
 *
 * The start time is read where the platform publishes it for any process:
 * Linux's `/proc/<pid>/stat` (field 22, the start in clock ticks after boot —
 * compared as it is, never converted). Elsewhere no start time is read
 * (`null`), and a process that exists under that pid is taken as alive: a
 * reused pid then hides a dead process's file until that other process ends —
 * the safe side, since a live process's file is never touched.
 */

import * as fs from 'node:fs';

/** A process, as a runtime file names it. */
export interface ProcessStamp {
  pid: number;
  /** Its start, as the platform states it; `null` where none is read. */
  start: string | null;
}

/** How the owner learns who it is and whether a file's process lives. */
export interface ProcessProbe {
  /** This process. */
  self(): ProcessStamp;
  /** Whether the process `stamp` names still runs. */
  isAlive(stamp: ProcessStamp): boolean;
}

/** The start of `pid` from `/proc` (Linux); `null` where there is none to read. */
export function procStart(pid: number): string | null {
  let text: string;
  try {
    text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return null;
  }
  // The command name (field 2) is in parentheses and may hold spaces: the
  // fields after it start at the last `)`. Field 22 is the 20th after it.
  const close = text.lastIndexOf(')');
  if (close < 0) return null;
  const fields = text
    .slice(close + 1)
    .trim()
    .split(' ');
  const start = fields[19];
  return start !== undefined && start !== '' ? start : null;
}

/** Whether a process with `pid` exists: signal 0 tests, sends nothing. */
function exists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Another user's process answers EPERM: it exists.
    return (error as { code?: unknown }).code === 'EPERM';
  }
}

/** The probe of this machine: `/proc` on Linux, the pid alone elsewhere. */
export function nodeProcessProbe(): ProcessProbe {
  const own: ProcessStamp = { pid: process.pid, start: procStart(process.pid) };
  return {
    self: () => own,
    isAlive(stamp) {
      if (!Number.isInteger(stamp.pid) || stamp.pid <= 0) return false;
      if (stamp.pid === own.pid) return stamp.start === own.start;
      if (stamp.start !== null) {
        const now = procStart(stamp.pid);
        // Read where it was written: the start decides, and no entry means
        // the process is gone.
        if (now !== null || fs.existsSync('/proc/self/stat')) {
          return now === stamp.start;
        }
      }
      return exists(stamp.pid);
    },
  };
}
